// Public SQLite API. The code lives in lib/database-*.ts; callers import from '@/lib/database'
// (never a database-* file) so jest.mock('@/lib/database') keeps covering them.
export { getDatabase } from '@/lib/database-connection';
export {
  getFoodSearchMetadata,
  getFoodsByIds,
  searchFoods,
  searchFoodsByTokens,
  searchFoodsBySingleToken,
  searchLiquids,
  hasAnyMicros,
  cacheRemoteFood,
  getFoodByBarcode,
  getFoodById,
  addCustomFood,
  updateCustomFood,
  getUnsyncedCustomFoods,
  markCustomFoodsSynced,
  applyRemoteCustomFoods,
} from '@/lib/database-foods';
export {
  addFoodLog,
  addFoodLogsBatch,
  getFoodLogsByDate,
  deleteFoodLog,
  getUnsyncedFoodLogs,
  updateFoodLog,
  getFoodLogsWithFoodByDate,
  getRecentFoods,
  getFrequentFoods,
  getLoggedDates,
  getLoggedDatesInRange,
  getAllLoggedDates,
  getFoodLogsWithFoodInRange,
  isRemoteNewer,
  applyRemoteFoodLogs,
} from '@/lib/database-food-logs';
export {
  getMealSlotConfirmationsByDate,
  upsertMealSlotConfirmation,
  ensureMealSlotStatus,
  deleteMealSlotConfirmation,
  getMealSlotConfirmationsInRange,
  getMealDefinitions,
  getMealNames,
  countFoodLogsForMeal,
  saveMealDraft,
  getUnsyncedMealDefinitions,
  markMealDefinitionsSynced,
  getUnsyncedMealNames,
  markMealNamesSynced,
  replaceMealsFromRemote,
} from '@/lib/database-meals';
export { addWaterLog, getWaterLogsByDate, deleteWaterLog } from '@/lib/database-water';
export { getMissingFoodIds, clearUserData, markAllUnsynced } from '@/lib/database-maintenance';
