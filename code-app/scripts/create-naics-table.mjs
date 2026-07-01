const orgUrl = "https://org3a57b8d4.crm.dynamics.com";
const token = process.env.DATAVERSE_TOKEN || process.env.DATAVERSE_ACCESS_TOKEN;

if (!token) throw new Error("DATAVERSE_TOKEN is not set.");

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
};

async function request(path, init = {}) {
  const res = await fetch(`${orgUrl}/api/data/v9.2/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} failed ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function entityExists(logicalName) {
  const res = await fetch(
    `${orgUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,EntitySetName`,
    { headers }
  );

  const text = await res.text();
  if (res.status === 404 || text.includes("does not exist")) return false;
  if (!res.ok) throw new Error(`Entity check failed ${res.status}: ${text}`);
  return true;
}

async function getAttributes(entityLogicalName) {
  const data = await request(
    `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName`
  );
  return new Set((data.value || []).map((a) => a.LogicalName));
}

async function createStringAttribute(entityLogicalName, logicalName, schemaName, label, maxLength, required = false) {
  const payload = {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    LogicalName: logicalName,
    SchemaName: schemaName,
    DisplayName: {
      LocalizedLabels: [{ Label: label, LanguageCode: 1033 }],
    },
    RequiredLevel: {
      Value: required ? "ApplicationRequired" : "None",
      CanBeChanged: true,
      ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings",
    },
    MaxLength: maxLength,
    FormatName: { Value: "Text" },
  };

  await request(`EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function main() {
  const entityLogicalName = "cr664_naicscode";

  if (!(await entityExists(entityLogicalName))) {
    console.log("Creating table through EntityDefinitions: cr664_naicscode / cr664_naicscodes");

    await request("EntityDefinitions", {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        SchemaName: "cr664_NAICSCode",
        LogicalName: "cr664_naicscode",
        EntitySetName: "cr664_naicscodes",
        DisplayName: {
          LocalizedLabels: [{ Label: "NAICS Code", LanguageCode: 1033 }],
        },
        DisplayCollectionName: {
          LocalizedLabels: [{ Label: "NAICS Codes", LanguageCode: 1033 }],
        },
        Description: {
          LocalizedLabels: [{ Label: "NAICS reference codes.", LanguageCode: 1033 }],
        },
        OwnershipType: "UserOwned",
        IsAuditEnabled: { Value: false },
        HasActivities: false,
        HasNotes: false,
        Attributes: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            LogicalName: "cr664_code",
            SchemaName: "cr664_Code",
            DisplayName: {
              LocalizedLabels: [{ Label: "Code", LanguageCode: 1033 }],
            },
            RequiredLevel: {
              Value: "ApplicationRequired",
              CanBeChanged: true,
              ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings",
            },
            MaxLength: 6,
            FormatName: { Value: "Text" },
            IsPrimaryName: true,
          },
        ],
      }),
    });
  } else {
    console.log("Table already exists: cr664_naicscode");
  }

  console.log("Publishing table metadata...");
  await request("PublishAllXml", { method: "POST", body: "{}" });

  const present = await getAttributes(entityLogicalName);

  const columns = [
    ["cr664_title", "cr664_Title", "Title", 850],
    ["cr664_sectorcode", "cr664_SectorCode", "Sector Code", 5],
    ["cr664_sectortitle", "cr664_SectorTitle", "Sector Title", 850],
    ["cr664_naicsversion", "cr664_NAICSVersion", "NAICS Version", 8],
  ];

  for (const [logicalName, schemaName, label, maxLength] of columns) {
    if (present.has(logicalName)) {
      console.log(`Column already exists: ${logicalName}`);
    } else {
      console.log(`Creating column: ${logicalName}`);
      await createStringAttribute(entityLogicalName, logicalName, schemaName, label, maxLength);
    }
  }

  console.log("Publishing column metadata...");
  await request("PublishAllXml", { method: "POST", body: "{}" });

  const keys = await request(
    `EntityDefinitions(LogicalName='${entityLogicalName}')/Keys?$select=SchemaName`
  );

  const keyExists = (keys.value || []).some((k) => k.SchemaName === "cr664_NAICSCode_AK");

  if (keyExists) {
    console.log("Alternate key already exists: cr664_NAICSCode_AK");
  } else {
    console.log("Creating alternate key: cr664_NAICSCode_AK on cr664_code");
    await request(`EntityDefinitions(LogicalName='${entityLogicalName}')/Keys`, {
      method: "POST",
      body: JSON.stringify({
        SchemaName: "cr664_NAICSCode_AK",
        DisplayName: {
          LocalizedLabels: [{ Label: "NAICS Code Alternate Key", LanguageCode: 1033 }],
        },
        KeyAttributes: ["cr664_code"],
      }),
    });
  }

  console.log("Publishing key metadata...");
  await request("PublishAllXml", { method: "POST", body: "{}" });

  console.log("NAICS provisioning complete.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
