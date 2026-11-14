# Changes to existing backends

The CEO App never changes or removes an existing backend action. Any new
manager action added to Inventory, Operations Centre or the Social Planner is
listed here.

## Phase 1
None. Every Phase 1 change uses actions those apps already have:

| App | Actions used |
| --- | --- |
| Inventory | getIngredients, getProductionData (read); excludeFromLowStock, clearLowStockExclusion, markDiscontinued, clearDiscontinued (write) |
| Operations Centre | getDirectorAttention, getTasks, getProduction, getDeliveries, getPurchases, getCalendar (read); respondDirectorAttention, createTask, updateTask, updateProduction, updateDelivery, updatePurchase, updateCalendarEvent (write) |

Changes from the CEO App are signed `Efua` with tier `Manager` in Operations
Centre's Activity Log, the same as changes made there.
