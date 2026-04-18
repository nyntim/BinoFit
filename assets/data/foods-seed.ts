type SeedFood = {
  name: string;
  brand?: string;
  serving_units: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source?: string;
};

export const FOODS_SEED: SeedFood[] = [
  // Proteins
  { name: 'Chicken Breast (cooked)', serving_units: '100g', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: 'Ground Beef 80/20 (cooked)', serving_units: '100g', calories: 254, protein: 26, carbs: 0, fat: 17 },
  { name: 'Salmon (cooked)', serving_units: '100g', calories: 208, protein: 28, carbs: 0, fat: 10 },
  { name: 'Tuna (canned in water)', serving_units: '100g', calories: 116, protein: 26, carbs: 0, fat: 1 },
  { name: 'Eggs (large)', serving_units: '1 egg (50g)', calories: 72, protein: 6, carbs: 0.4, fat: 5 },
  { name: 'Greek Yogurt (plain, 0% fat)', serving_units: '100g', calories: 59, protein: 10, carbs: 3.6, fat: 0.4 },
  { name: 'Cottage Cheese (1% fat)', serving_units: '100g', calories: 72, protein: 12, carbs: 2.7, fat: 1 },
  { name: 'Turkey Breast (cooked)', serving_units: '100g', calories: 135, protein: 30, carbs: 0, fat: 1 },
  { name: 'Shrimp (cooked)', serving_units: '100g', calories: 99, protein: 24, carbs: 0.2, fat: 0.3 },
  { name: 'Whey Protein Powder', serving_units: '1 scoop (30g)', calories: 120, protein: 24, carbs: 3, fat: 1.5 },

  // Carbohydrates
  { name: 'White Rice (cooked)', serving_units: '100g', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { name: 'Brown Rice (cooked)', serving_units: '100g', calories: 123, protein: 2.7, carbs: 26, fat: 1 },
  { name: 'Oatmeal (cooked)', serving_units: '100g', calories: 71, protein: 2.5, carbs: 12, fat: 1.5 },
  { name: 'Sweet Potato (baked)', serving_units: '100g', calories: 90, protein: 2, carbs: 21, fat: 0.1 },
  { name: 'White Potato (baked)', serving_units: '100g', calories: 93, protein: 2.5, carbs: 21, fat: 0.1 },
  { name: 'Whole Wheat Bread', serving_units: '1 slice (28g)', calories: 80, protein: 4, carbs: 15, fat: 1 },
  { name: 'White Bread', serving_units: '1 slice (25g)', calories: 67, protein: 2, carbs: 13, fat: 0.9 },
  { name: 'Pasta (cooked)', serving_units: '100g', calories: 131, protein: 5, carbs: 25, fat: 1.1 },
  { name: 'Banana', serving_units: '1 medium (118g)', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { name: 'Apple', serving_units: '1 medium (182g)', calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { name: 'Orange', serving_units: '1 medium (131g)', calories: 62, protein: 1.2, carbs: 15, fat: 0.2 },
  { name: 'Blueberries', serving_units: '100g', calories: 57, protein: 0.7, carbs: 14, fat: 0.3 },
  { name: 'Strawberries', serving_units: '100g', calories: 32, protein: 0.7, carbs: 8, fat: 0.3 },
  { name: 'Black Beans (cooked)', serving_units: '100g', calories: 132, protein: 8.9, carbs: 24, fat: 0.5 },
  { name: 'Lentils (cooked)', serving_units: '100g', calories: 116, protein: 9, carbs: 20, fat: 0.4 },

  // Fats
  { name: 'Avocado', serving_units: '100g', calories: 160, protein: 2, carbs: 9, fat: 15 },
  { name: 'Olive Oil', serving_units: '1 tbsp (14g)', calories: 119, protein: 0, carbs: 0, fat: 14 },
  { name: 'Almonds', serving_units: '28g (1oz)', calories: 164, protein: 6, carbs: 6, fat: 14 },
  { name: 'Peanut Butter (natural)', serving_units: '2 tbsp (32g)', calories: 188, protein: 8, carbs: 6, fat: 16 },
  { name: 'Cheddar Cheese', serving_units: '28g (1oz)', calories: 114, protein: 7, carbs: 0.4, fat: 9 },
  { name: 'Whole Milk', serving_units: '240ml (1 cup)', calories: 149, protein: 8, carbs: 12, fat: 8 },
  { name: '2% Milk', serving_units: '240ml (1 cup)', calories: 122, protein: 8, carbs: 12, fat: 5 },

  // Vegetables
  { name: 'Broccoli (cooked)', serving_units: '100g', calories: 35, protein: 2.4, carbs: 7, fat: 0.4 },
  { name: 'Spinach (raw)', serving_units: '100g', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
  { name: 'Carrots (raw)', serving_units: '100g', calories: 41, protein: 0.9, carbs: 10, fat: 0.2 },
  { name: 'Bell Pepper (red)', serving_units: '100g', calories: 31, protein: 1, carbs: 6, fat: 0.3 },
  { name: 'Cucumber', serving_units: '100g', calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
  { name: 'Tomato', serving_units: '100g', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { name: 'Romaine Lettuce', serving_units: '100g', calories: 17, protein: 1.2, carbs: 3.3, fat: 0.3 },

  // Common packaged
  { name: 'Cheerios', brand: 'General Mills', serving_units: '1 cup (28g)', calories: 103, protein: 3, carbs: 22, fat: 2 },
  { name: 'Instant Oatmeal Original', brand: "Quaker", serving_units: '1 packet (28g)', calories: 100, protein: 3, carbs: 19, fat: 2 },
];
