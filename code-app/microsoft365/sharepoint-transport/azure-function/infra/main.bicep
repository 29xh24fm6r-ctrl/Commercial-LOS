targetScope = 'resourceGroup'

@description('Deployment environment name, for example prod or test.')
param environmentName string
@description('Azure region for all resources.')
param location string = resourceGroup().location
@description('Globally unique Function App base name.')
param functionAppName string
@description('Storage account name.')
param storageAccountName string
@description('Application Insights name.')
param applicationInsightsName string
@description('Allowed Code App/custom connector origins only.')
param allowedOrigins array
@description('Optional user-assigned managed identity resource ID. Leave empty for system assigned.')
param userAssignedIdentityResourceId string = ''
@description('Optional user-assigned managed identity client ID.')
param managedIdentityClientId string = ''
param configurationVersion string = 'UNRESOLVED'
param connectorIdentity string = 'UNRESOLVED'
param runtimeIdentity string = 'UNRESOLVED'
param permissionGrantEvidenceId string = 'UNRESOLVED'
param configurationHash string = 'UNRESOLVED'
param idempotencyTableName string = 'SharePointIdempotency'
param orphanTableName string = 'SharePointOrphans'
param dataverseAuthorizationAdapter string = 'UNRESOLVED'

var useUserIdentity = !empty(userAssignedIdentityResourceId)
var identityConfig = useUserIdentity ? {
  type: 'UserAssigned'
  userAssignedIdentities: { '${userAssignedIdentityResourceId}': {} }
} : { type: 'SystemAssigned' }

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource idempotencyTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = { name: '${storage.name}/default/${idempotencyTableName}' }
resource orphanTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = { name: '${storage.name}/default/${orphanTableName}' }

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  kind: 'web'
  properties: { Application_Type: 'web' }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${functionAppName}-plan'
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: identityConfig
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      linuxFxVersion: 'NODE|22'
      cors: { allowedOrigins: allowedOrigins, supportCredentials: false }
      appSettings: [
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: managedIdentityClientId }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'SP_TENANT_ID', value: 'e5d2be43-2e2c-4968-b5f3-c73dd825ee80' }
        { name: 'SP_GRAPH_SITE_ID', value: 'oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48' }
        { name: 'SP_GRAPH_DRIVE_ID', value: 'b!lYrv_Li2f0yF2dMMTROqivV7fyyVmbJIk6QTe8dBz0gxIabBRnm5RLtMtGN6Fvg8' }
        { name: 'SP_GOVERNED_ROOT_ITEM_ID', value: '01GLFG6KONJ5W27MKUD5AZRKTJWP2MGT5P' }
        { name: 'SP_GOVERNED_ROOT_PATH', value: '/(a) Loans' }
        { name: 'SP_SITE_URL', value: 'https://oldglory22.sharepoint.com/sites/BusinessLending' }
        { name: 'SP_LIBRARY_ID', value: 'c1a62131-7946-44b9-bb4c-b4637a16f83c' }
        { name: 'SP_CONTRACT_VERSION', value: 'ogb-deal-sharepoint/v1' }
        { name: 'SP_CONFIGURATION_VERSION', value: configurationVersion }
        { name: 'SP_FUNCTION_RESOURCE_ID', value: resourceId('Microsoft.Web/sites', functionAppName) }
        { name: 'SP_FUNCTION_HOSTNAME', value: '${functionAppName}.azurewebsites.net' }
        { name: 'SP_CONNECTOR_IDENTITY', value: connectorIdentity }
        { name: 'SP_RUNTIME_IDENTITY', value: runtimeIdentity }
        { name: 'SP_MANAGED_IDENTITY_CLIENT_ID', value: managedIdentityClientId }
        { name: 'SP_PERMISSION_GRANT_EVIDENCE_ID', value: permissionGrantEvidenceId }
        { name: 'SP_CONFIGURATION_HASH', value: configurationHash }
        { name: 'SP_IDEMPOTENCY_TABLE', value: idempotencyTableName }
        { name: 'SP_ORPHAN_TABLE', value: orphanTableName }
        { name: 'SP_DATAVERSE_AUTHORIZATION_ADAPTER', value: dataverseAuthorizationAdapter }
      ]
    }
  }
}

resource functionBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!useUserIdentity) {
  name: guid(storage.id, functionApp.id, 'Storage Blob Data Owner')
  scope: storage
  properties: { principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b') }
}
resource functionQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!useUserIdentity) {
  name: guid(storage.id, functionApp.id, 'Storage Queue Data Contributor')
  scope: storage
  properties: { principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88') }
}
resource functionTableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!useUserIdentity) {
  name: guid(storage.id, functionApp.id, 'Storage Table Data Contributor')
  scope: storage
  properties: { principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3') }
}
resource auth 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true, runtimeVersion: '~1' }
    globalValidation: { requireAuthentication: true, unauthenticatedClientAction: 'Return401' }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: { openIdIssuer: '${environment().authentication.loginEndpoint}e5d2be43-2e2c-4968-b5f3-c73dd825ee80/v2.0', clientId: connectorIdentity }
        validation: { allowedAudiences: [connectorIdentity] }
      }
    }
    login: { tokenStore: { enabled: false } }
    httpSettings: { requireHttps: true, routes: { apiPrefix: '/.auth' }, forwardProxy: { convention: 'NoProxy' } }
  }
}

output functionResourceId string = functionApp.id
output functionHostname string = functionApp.properties.defaultHostName
output functionPrincipalId string = functionApp.identity.principalId
output managedIdentityResourceId string = useUserIdentity ? userAssignedIdentityResourceId : functionApp.id
output storageResourceId string = storage.id
output applicationInsightsResourceId string = insights.id
output environment string = environmentName
