# M365-1 Outlook Calendar connector inventory — 2026-07-28

Inventory source files:

- `src/generated/services/Office365OutlookService.ts`
- `src/generated/models/Office365OutlookModel.ts`
- `src/generated/index.ts`
- `power.config.json`
- `.power/schemas/appschemas/dataSourcesInfo.ts` when present locally
- `scripts/activation/verify-outlook-connector.ps1`
- `scripts/activation/verify-microsoft365-integration.ps1`
- `docs/MICROSOFT_365_INTEGRATION_RUNBOOK.md`

## Generated Outlook calendar operations observed

Only operation names actually present in `Office365OutlookService.ts` are listed.

| Capability | Generated operation(s) observed |
| --- | --- |
| Calendar metadata | `CalendarGetTable` |
| Calendar listing | `CalendarGetTables`, `CalendarGetTables_V2` |
| Event listing | `CalendarGetItems`, `GetEventsCalendarView`, `GetEventsCalendarViewV2`, `GetEventsCalendarViewV3` |
| Event lookup | `CalendarGetItem` |
| Availability / free-busy | `FindMeetingTimes`, `FindMeetingTimes_V2` |
| Rooms / location suggestions | `GetRoomLists`, `GetRoomLists_V2`, `GetRooms`, `GetRooms_V2`, `GetRoomsInRoomList`, `GetRoomsInRoomList_V2` |
| Event creation | `CalendarPostItem` |
| Event update | `CalendarPatchItem` |
| Event cancellation/deletion | `CalendarDeleteItem`, `CalendarDeleteItem_V2` |
| Event response | `RespondToEvent`, `RespondToEvent_V2` |
| Event change/subscription triggers | `OnUpcomingEvents`, `OnUpcomingEventsV2`, `OnUpcomingEventsV3`, `CalendarGetOnNewItems`, `CalendarGetOnNewItemsV2`, `CalendarGetOnNewItemsV3`, `CalendarGetOnUpdatedItems`, `CalendarGetOnUpdatedItemsV2`, `CalendarGetOnUpdatedItemsV3`, `CalendarGetOnChangedItems`, `CalendarGetOnChangedItemsV2`, `CalendarGetOnChangedItemsV3`, `CreateOnChangedEventPokeSubscription`, `CreateGraphOnChangedEventPokeSubscription`, `DeleteEventSubscription`, `RenewEventSubscription`, `ReceiveEventFromSubscription`, `ReceiveEventFromSubscriptionV2` |
| Generic Graph proxy | `HttpRequest` exists in the generated service but is not approved for this arc |

## Teams meeting / online meeting fields

No generated model field containing `onlineMeeting`, `joinUrl`, `teams`, or equivalent was observed in `Office365OutlookModel.ts` as of this inventory. Therefore Teams meeting-link creation cannot be considered proven until a real generated Outlook operation returns a join URL or an approved server-side boundary is added and certified.

## Phase gate

No calendar UX or write capability may be added until:

```powershell
powershell -File scripts/activation/verify-outlook-calendar-connector.ps1
```

reports:

- `CALENDAR_CONFIGURED=PASS`
- `CALENDAR_RUNTIME_BOUND=PASS`
- `CALENDAR_READ_OPERATIONS=PASS`
- `STATUS=PASS`

`CALENDAR_WRITE_OPERATIONS=PASS` only means the generated SDK contains create/update/delete operations. It does not enable writes.
