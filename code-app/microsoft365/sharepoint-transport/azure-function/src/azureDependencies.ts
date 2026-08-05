import { DefaultAzureCredential } from '@azure/identity';
import { TableClient, type TableEntity } from '@azure/data-tables';
import { ManagedIdentitySharePointGraphClient } from '../../graph/managedIdentityGraphClient.js';
import type { DurableJsonStore } from '../../production/durableLedgers.js';

export function createManagedIdentityGraphClient(managedIdentityClientId?: string): ManagedIdentitySharePointGraphClient {
  const credential = new DefaultAzureCredential(managedIdentityClientId ? { managedIdentityClientId } : undefined);
  return new ManagedIdentitySharePointGraphClient(credential);
}

interface JsonEntity extends TableEntity { payload: string }
export class AzureTableDurableJsonStore implements DurableJsonStore {
  readonly storeId: string;
  private readonly client: TableClient;
  constructor(accountName: string, tableName: string, managedIdentityClientId?: string) {
    if (!/^[a-z0-9]{3,24}$/.test(accountName) || !/^[A-Za-z][A-Za-z0-9]{2,62}$/.test(tableName)) throw new Error('AZURE_TABLE_CONFIGURATION_INVALID');
    this.storeId = `https://${accountName}.table.core.windows.net/${tableName}`;
    this.client = new TableClient(`https://${accountName}.table.core.windows.net`, tableName, new DefaultAzureCredential(managedIdentityClientId ? { managedIdentityClientId } : undefined));
  }
  async healthCheck(): Promise<boolean> { try { const pages = this.client.listEntities({ queryOptions: { select: ['PartitionKey'] } }).byPage({ maxPageSize: 1 }); await pages.next(); return true; } catch { return false; } }
  async createIfAbsent(partition: string, key: string, value: unknown): Promise<boolean> { try { await this.client.createEntity({ partitionKey: partition, rowKey: key, payload: JSON.stringify(value) }); return true; } catch (error) { if ((error as { statusCode?: number }).statusCode === 409) return false; throw error; } }
  async read<T>(partition: string, key: string): Promise<T | undefined> { try { const entity = await this.client.getEntity<JsonEntity>(partition, key); return JSON.parse(entity.payload) as T; } catch (error) { if ((error as { statusCode?: number }).statusCode === 404) return undefined; throw error; } }
  async replace(partition: string, key: string, value: unknown): Promise<void> { await this.client.updateEntity({ partitionKey: partition, rowKey: key, payload: JSON.stringify(value) }, 'Replace', { etag: '*' }); }
  async delete(partition: string, key: string): Promise<void> { try { await this.client.deleteEntity(partition, key); } catch (error) { if ((error as { statusCode?: number }).statusCode !== 404) throw error; } }
}
