# Data model

Core types live in `lib/types.ts`. Training types are in `lib/workouts/` and [training.md](training.md); nutrient types are in `lib/nutrients.ts` ([nutrition.md](nutrition.md)).

```typescript
Food = { id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at }
MealId = string  // MealSlot is an alias; food_logs.meal_slot holds a meal id
MealDefinition = { id, position, calorie_target, protein_target, carb_target, fat_target (number|null), reminder_time ('HH:mm'|null), created_at, updated_at, synced_at? }
MealNameEntry = { meal_id, name, effective_from (yyyy-MM-dd), updated_at, synced_at? }  // name history; renames apply from today
FoodLog = { id, date, meal_slot, food_id, serving_amount, serving_unit, created_at, updated_at, synced_at?, deleted_at? }
MealSlotConfirmation = { id, date, meal_slot, confirmed, updated_at }
WeightEntry = { id, date, weight_kg, measured_at, created_at, updated_at, synced_at?, deleted_at? }  // kg; latest per day wins
UserGoals = { calorie_goal, protein_goal, carb_goal, fat_goal, weekly_volume_targets? (partial eligible-region map, integer sets 1..40), updated_at }
UserProfile = { weight, height, activity_level, updated_at }
WaterLog = { id, date, amount, drink_name, created_at }
QuickAddDrink = { id, name, amount, food_id? }
```

Water logs, slot confirmations and quick-add drinks do not sync yet.
