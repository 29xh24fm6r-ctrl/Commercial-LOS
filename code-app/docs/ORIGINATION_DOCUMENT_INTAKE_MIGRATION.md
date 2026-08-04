# Origination document migration and legacy treatment

Migration is additive and idempotent. It never deletes or rewrites historical checklist, borrower-request, review, audit, or timeline records.

| Classification | Treatment | Counts toward new readiness |
| --- | --- | --- |
| `SHAREPOINT_NATIVE` | Verify folder, deal, item ID, URL, and active mapping. | Yes |
| `DATAVERSE_FILE_LEGACY` | Preserve file/download and show a legacy badge. Migrate only through a separately approved copy-and-verify operation. | No |
| `METADATA_ONLY_LEGACY` | Preserve history and display that no verified file exists. | No |
| `NO_FILE_REFERENCE` | Keep requirement outstanding. | No |
| `MIGRATION_REQUIRED` | Block readiness until reconciled. | No |

Replacement never deletes the prior item. The active pointer changes only after the new SharePoint item and Dataverse metadata read back successfully. Multi-requirement satisfaction requires explicit mapping rows; filenames never imply mappings.
