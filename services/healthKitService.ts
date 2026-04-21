// v1.1.0 - Apple Health Integration
import { Platform } from 'react-native';
import AppleHealthKit from 'react-native-health';

export async function writeNutritionLog(
  date: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number
): Promise<void> {
  if (Platform.OS !== 'ios') return;

  // Handle both default and namespace imports for interop
  const hk = (AppleHealthKit as any)?.default || AppleHealthKit;
  
  if (!hk.saveDietaryEnergyConsumed) {
    console.warn('HealthKit save methods not available (likely running in Expo Go)');
    return;
  }

  // HealthKit requires date in ISO format.
  // Using noon local time to avoid aggregation issues.
  const sampleDate = new Date(`${date}T12:00:00`).toISOString();

  const writeData = (permission: string, value: number, unit: string) => {
    return new Promise<void>((resolve) => {
      const options = {
        value,
        unit,
        startDate: sampleDate,
        endDate: sampleDate,
      };

      const method = (permission as any); // Dynamic call for brevity
      let saveMethod;
      const hk = AppleHealthKit as any;
      switch(permission) {
        case 'EnergyConsumed': saveMethod = hk.saveDietaryEnergyConsumed; break;
        case 'Protein': saveMethod = hk.saveProtein; break;
        case 'Carbohydrates': saveMethod = hk.saveCarbohydrates; break;
        case 'FatTotal': saveMethod = hk.saveFatTotal; break;
      }

      if (saveMethod) {
        saveMethod(options, (err: Object) => {
          if (err) console.error(`Error saving ${permission}:`, err);
          resolve();
        });
      } else {
        resolve();
      }
    });
  };

  try {
    await Promise.all([
      writeData('EnergyConsumed', calories, 'kcal'),
      writeData('Protein', protein, 'gram'),
      writeData('Carbohydrates', carbs, 'gram'),
      writeData('FatTotal', fat, 'gram'),
    ]);
  } catch (error) {
    console.error('Failed to write to HealthKit:', error);
  }
}
