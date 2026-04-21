# Multi-Platform Deployment Plan
## Fitness & Nutrition Tracking App (React Native + Expo)

---

## Executive Summary

This plan outlines how to build a single **React Native codebase** that compiles to three platforms: **web (PWA)**, **iOS**, and **Android**. The strategy enables rapid iteration on web with zero platform costs, followed by native deployments when justified.

Key principle: **One codebase, three targets.**

---

## Architecture Overview

### Single Codebase, Multiple Targets

```
src/
├── components/          (React Native components, work on all platforms)
├── screens/            (App screens, shared across platforms)
├── services/           (Business logic, data handling)
├── storage/            (AsyncStorage abstraction layer)
├── navigation/         (Platform-specific routing)
└── app.json            (Expo configuration)

Outputs:
├── Web (PWA)           → Vercel/Netlify
├── iOS (Native)        → App Store
└── Android (Native)    → Google Play Store
```

### Storage Architecture

**All platforms use the same storage abstraction:**

| Platform | Implementation | Capacity | Notes |
|----------|---|---|---|
| **Web (PWA)** | IndexedDB (primary) + localStorage fallback | ~50 MB | iOS PWA has 30-day expiry risk; sync to backend mitigates |
| **iOS (Native)** | AsyncStorage + SQLite (via React Native modules) | 5-10 MB + 100+ MB | More reliable; can bundle food DB |
| **Android (Native)** | AsyncStorage + SQLite (via React Native modules) | 5-10 MB + 100+ MB | Same as iOS |

---

## Phase 1: Foundation & Setup

### 1.1 Project Initialization

**Create a new Expo project with web support enabled:**

```bash
npx create-expo-app NutritionTracker
cd NutritionTracker
npx expo install expo-web
```

**Configure Expo for all three targets:**
- Edit `app.json` to specify iOS, Android, and web configurations
- Set up app icon, splash screen, and branding for all platforms
- Configure EAS (Expo Application Services) for building native binaries

### 1.2 Dependency Setup

**Install core dependencies:**
- `@react-navigation/native` — routing (works on all platforms)
- `@react-navigation/native-stack` — native-style navigation
- `@react-native-community/async-storage` — cross-platform storage abstraction
- `expo-sqlite` — database for food data (native + web support)
- `zustand` or `redux-toolkit` — state management
- `axios` or `fetch` — API calls (future backend integration)

**Platform-specific considerations:**
- Web: React Native Web installed automatically by Expo
- iOS/Android: Native modules (AsyncStorage, SQLite) bundled by Expo

### 1.3 Project Structure

**Organize code for cross-platform compatibility:**

```
src/
├── app/                    # Navigation and routing
│   ├── AppNavigator.tsx   # Navigation stack (platform-aware)
│   └── RootStack.tsx      # Root navigation
│
├── screens/                # App screens (platform-agnostic)
│   ├── HomeScreen.tsx
│   ├── LogMealScreen.tsx
│   ├── FoodSearchScreen.tsx
│   ├── NutritionSummaryScreen.tsx
│   └── SettingsScreen.tsx
│
├── components/             # Reusable React Native components
│   ├── MealCard.tsx
│   ├── NutrientBar.tsx
│   ├── FoodSearchBar.tsx
│   ├── DatePicker.tsx
│   └── ... (more components)
│
├── services/               # Business logic
│   ├── foodDatabase.ts     # Food DB queries
│   ├── mealLogger.ts       # Meal logging logic
│   ├── nutritionCalculator.ts # Macro/calorie math
│   └── dataSync.ts         # Future backend sync
│
├── storage/                # Storage abstraction
│   ├── asyncStorage.ts     # AsyncStorage wrapper
│   ├── database.ts         # SQLite setup
│   ├── foodIndex.ts        # Food DB initialization
│   └── userStore.ts        # User data persistence
│
├── utils/                  # Utilities
│   ├── constants.ts
│   ├── formatting.ts
│   └── validation.ts
│
├── hooks/                  # Custom React hooks
│   ├── useMealLog.ts
│   ├── useNutritionStats.ts
│   └── useFoodSearch.ts
│
├── state/                  # Global state (Zustand/Redux)
│   ├── mealStore.ts
│   ├── userStore.ts
│   └── appStore.ts
│
└── app.json               # Expo configuration
```

### 1.4 Configure Platform-Specific Entry Points

**Create platform-aware initialization:**

```typescript
// app/index.ts (Expo automatically routes based on platform)
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // Web-specific initialization (PWA manifest, service worker)
  registerServiceWorker();
  configureIndexedDB();
} else {
  // Native-specific initialization (SQLite, native modules)
  initializeSQLite();
  configureNativeNotifications();
}
```

---

## Phase 2: Data Layer (Storage & Food Database)

### 2.1 Food Database Strategy

**Problem:** USDA food database is ~150-200 MB uncompressed.

**Solution: Tiered approach**

#### Core Food Index (All Platforms)
- Top 5,000 most commonly logged foods (~5 MB compressed)
- Includes: name, calories, macros (protein, fat, carbs), key micros
- Bundled with the app
- Indexed for fast search

**Implementation:**
```typescript
// storage/foodIndex.ts
import foodIndexData from '../assets/food-index.json'; // Pre-compressed

interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  servingSize: string;
}

export const initializeFoodIndex = async () => {
  // Load into IndexedDB (web) or SQLite (native)
  const db = await getDatabase();
  for (const food of foodIndexData) {
    await db.createFood(food);
  }
};

export const searchFoods = async (query: string): Promise<FoodEntry[]> => {
  const db = await getDatabase();
  return db.searchFoods(query);
};
```

#### Extended Food Database (Optional, Future)
- Full USDA database or third-party API
- Accessed on-demand for uncommon foods
- Requires network or lazy-loaded chunks

**Web-specific fallback:**
```typescript
// services/foodDatabase.ts
export const searchFood = async (query: string) => {
  // 1. Search local index first (fast, offline)
  const localResults = await searchFoods(query);
  if (localResults.length > 0) return localResults;

  // 2. If not found, search remote API (web only, requires network)
  if (Platform.OS === 'web') {
    const remoteResults = await fetch(
      `/api/foods/search?q=${query}`
    ).then(r => r.json());
    return remoteResults;
  }

  // 3. Native: inform user food not in local DB
  return [];
};
```

### 2.2 Storage Abstraction Layer

**Create a unified storage interface for all platforms:**

```typescript
// storage/asyncStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

export const createAsyncStorageAdapter = (): StorageAdapter => ({
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
  getAllKeys: () => AsyncStorage.getAllKeys(),
});
```

```typescript
// storage/database.ts
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<any>;
  execute(sql: string, params?: any[]): Promise<void>;
}

export const createDatabaseAdapter = (): DatabaseAdapter => {
  if (Platform.OS === 'web') {
    // Use IndexedDB wrapper
    return createIndexedDBAdapter();
  } else {
    // Use native SQLite
    return createSQLiteAdapter();
  }
};

const createIndexedDBAdapter = (): DatabaseAdapter => {
  let db: IDBDatabase;

  return {
    query: async (sql: string, params: any[]) => {
      // Parse SQL, execute in IndexedDB
      // This is a simplified abstraction
    },
    execute: async (sql: string, params: any[]) => {
      // Same as above
    },
  };
};

const createSQLiteAdapter = (): DatabaseAdapter => {
  const db = SQLite.openDatabase('nutrition-tracker.db');

  return {
    query: (sql, params = []) => db.execAsync([{ sql, args: params }]),
    execute: (sql, params = []) => db.execAsync([{ sql, args: params }]),
  };
};
```

### 2.3 User Data Schema

**Meals logged by user (all platforms):**

```sql
CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  name TEXT,
  foodId TEXT REFERENCES foods(id),
  quantity REAL NOT NULL,
  servingUnit TEXT NOT NULL,
  calories REAL,
  protein REAL,
  fat REAL,
  carbs REAL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_summary (
  date DATE PRIMARY KEY,
  totalCalories REAL,
  totalProtein REAL,
  totalFat REAL,
  totalCarbs REAL,
  mealCount INTEGER
);
```

---

## Phase 3: Core Features (Cross-Platform)

### 3.1 Home/Dashboard Screen

**Shows:**
- Today's nutrition summary (calories, macros)
- List of meals logged today
- Quick-add buttons for common meal patterns
- Progress toward daily goals

**Implementation considerations:**
- Uses `daily_summary` table for fast queries
- Responsive layout works on mobile (portrait) and web (desktop)
- No platform-specific code; uses standard React Native components

### 3.2 Meal Logging Screen

**Shows:**
- Food search (with local-first, remote fallback)
- Quantity input
- Serving unit selector
- Add to meal / Log meal

**Features:**
- Offline-first: search works without network (core foods)
- Real-time nutrition calculation
- Autocomplete for recently logged foods
- Same UI across web, iOS, Android

### 3.3 Food Search & Database Interaction

**Local search (all platforms):**
```typescript
// hooks/useFoodSearch.ts
import { useMemo } from 'react';
import { searchFoods } from '../services/foodDatabase';

export const useFoodSearch = (query: string) => {
  const [results, setResults] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;

    setLoading(true);
    searchFoods(query)
      .then(setResults)
      .finally(() => setLoading(false));
  }, [query]);

  return { results, loading };
};
```

### 3.4 Nutrition Calculation & Goals

**Shared logic across platforms:**
```typescript
// services/nutritionCalculator.ts
export interface NutritionTarget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const calculateDailyNutrition = async (date: Date): Promise<NutritionTarget> => {
  const db = await getDatabase();
  const meals = await db.query(
    'SELECT * FROM meals WHERE date = ?',
    [date.toISOString().split('T')[0]]
  );

  return meals.reduce((acc, meal) => ({
    calories: acc.calories + meal.calories,
    protein: acc.protein + meal.protein,
    fat: acc.fat + meal.fat,
    carbs: acc.carbs + meal.carbs,
  }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
};
```

---

## Phase 4: Web (PWA) Deployment

### 4.1 Expo Web Configuration

**In `app.json`, configure web settings:**
```json
{
  "expo": {
    "name": "Nutrition Tracker",
    "web": {
      "homepage": ".",
      "favicon": "./assets/favicon.png",
      "theme_color": "#000000",
      "backgroundColor": "#ffffff"
    }
  }
}
```

### 4.2 PWA Setup (Service Worker & Manifest)

**Expo automatically generates a service worker, but customize for your app:**

```typescript
// web/service-worker.ts (optional customization)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(reg => {
    console.log('PWA registered');
  });
}
```

**Manifest configuration (auto-generated, customize as needed):**
- App name, short name
- Icons (192x192, 512x512 for homescreen)
- Start URL (web app points to `/`)
- Display: standalone (full-screen PWA)
- Background color, theme color

### 4.3 Web Build & Deployment

**Build for web:**
```bash
npx expo build:web
```

**Deploy to Vercel (recommended for PWA):**
```bash
npm install -g vercel
vercel deploy ./dist
```

**Or use Netlify:**
```bash
npm run build
netlify deploy --prod --dir=dist
```

### 4.4 Offline-First Storage on Web

**IndexedDB configuration:**
```typescript
// storage/indexedDB.ts
export const initializeIndexedDB = async (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NutritionTracker', 1);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Create food store
      if (!db.objectStoreNames.contains('foods')) {
        db.createObjectStore('foods', { keyPath: 'id' });
      }

      // Create meals store
      if (!db.objectStoreNames.contains('meals')) {
        const mealStore = db.createObjectStore('meals', { keyPath: 'id' });
        mealStore.createIndex('date', 'date', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
```

### 4.5 PWA Installation Prompt & Onboarding

**Guide users to install PWA on iOS:**
```typescript
// components/PWAInstallPrompt.tsx
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';

export const PWAInstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Show prompt only on iOS PWA
    if (Platform.OS === 'web' && isIOS()) {
      setShowPrompt(true);
    }
  }, []);

  if (!showPrompt) return null;

  return (
    <View style={styles.promptContainer}>
      <Text style={styles.title}>
        💡 Faster access: Add to Home Screen
      </Text>
      <Text style={styles.instructions}>
        Tap the Share button, then "Add to Home Screen"
      </Text>
      <TouchableOpacity onPress={() => setShowPrompt(false)}>
        <Text style={styles.dismissButton}>Got it</Text>
      </TouchableOpacity>
    </View>
  );
};
```

---

## Phase 5: Native (iOS & Android) Deployment

### 5.1 Native Build Configuration

**Setup EAS (Expo Application Services) for native builds:**

```bash
npx eas build --platform ios
npx eas build --platform android
```

**Configure `eas.json`:**
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "buildType": "simulator"
      }
    },
    "preview2": {
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "buildType": "simulator"
      }
    },
    "production": {
      "android": {
        "buildType": "aab"
      }
    }
  }
}
```

### 5.2 iOS App Store Submission

**Prerequisites:**
- Apple Developer Account ($99/year)
- Certificates, provisioning profiles, signing identities (EAS handles most)

**Steps:**
1. Register bundle ID with Apple
2. Build production binary via EAS
3. Submit to App Store Connect
4. Fill out app information (description, screenshots, keywords)
5. Submit for review (~1-2 days)

**EAS simplifies this:**
```bash
eas build --platform ios --auto-submit
```

### 5.3 Android Google Play Store Submission

**Prerequisites:**
- Google Play Developer Account ($25 one-time)
- Signed APK/AAB (EAS generates this)

**Steps:**
1. Build release APK via EAS
2. Upload to Google Play Console
3. Fill out store listing (description, screenshots, content rating)
4. Submit for review (~24 hours, usually faster)

**EAS submission:**
```bash
eas build --platform android --auto-submit
```

### 5.4 Native Features (Post-MVP)

**Future enhancements for native apps:**
- **Camera integration** (photo-based food logging): `expo-camera`
- **Push notifications** (daily reminders): `expo-notifications`
- **Barcode scanning** (nutritional labels): `expo-barcode-scanner`
- **Native database** (SQLite for food DB): `expo-sqlite`

These are all available in Expo and don't break the cross-platform codebase.

---

## Phase 6: Backend Integration & Data Sync (Future)

### 6.1 Backend Architecture (Supabase + Postgres)

**When to add backend:**
- User accounts / authentication needed
- Cloud sync for meal logs across devices
- User-generated food database (custom foods)
- Advanced analytics / insights

**Schema (Postgres):**
```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW()
);

-- Meals (synced to cloud)
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID REFERENCES users(id),
  date DATE NOT NULL,
  foodId TEXT,
  quantity REAL,
  servingUnit TEXT,
  calories REAL,
  protein REAL,
  fat REAL,
  carbs REAL,
  createdAt TIMESTAMP DEFAULT NOW()
);

-- Custom foods (user-created)
CREATE TABLE customFoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID REFERENCES users(id),
  name TEXT NOT NULL,
  calories REAL,
  protein REAL,
  fat REAL,
  carbs REAL,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

### 6.2 Data Sync Strategy

**Sync approach:**
- On app launch: check for network, sync local meals to cloud
- Periodically: background sync (native only)
- On error: queue syncs, retry on network recovery
- Conflict resolution: last-write-wins

```typescript
// services/dataSync.ts
export const syncMealsToCloud = async (userId: string) => {
  const db = await getDatabase();
  const unsynced = await db.query(
    'SELECT * FROM meals WHERE synced = false'
  );

  for (const meal of unsynced) {
    try {
      await supabase
        .from('meals')
        .insert([meal]);

      await db.execute(
        'UPDATE meals SET synced = true WHERE id = ?',
        [meal.id]
      );
    } catch (error) {
      // Queue for retry
      console.error('Sync failed:', error);
    }
  }
};
```

---

## Phase 7: Release & Iteration

### 7.1 Versioning & Updates

**Web (PWA):**
- Deploy instantly via Vercel/Netlify
- No app store review
- Users get updates on refresh

**iOS/Android:**
- Use semantic versioning
- Submit to stores, wait for review (~1-2 days)
- Users are notified of updates

### 7.2 Monitoring & Analytics

**Consider adding:**
- Crash reporting: `@sentry/react-native`
- Analytics: Firebase Analytics (Expo-compatible)
- Usage metrics (meal logging patterns, retention)

### 7.3 Feedback Loop

**Collect user feedback:**
- In-app feedback button
- User testing with beta (TestFlight for iOS)
- App Store reviews
- Web analytics (Vercel analytics)

---

## Technical Decisions & Tradeoffs

### Decision: Single Codebase vs. Multiple

**✅ Chosen: Single React Native codebase**
- **Pro:** Faster development, shared logic, easier maintenance
- **Con:** Web might not feel 100% native; some features require platform detection

### Decision: Food Database Storage

**✅ Chosen: Core index (~5K foods, ~5 MB) bundled; extended via API**
- **Pro:** Fast offline search, small bundle size, extensible
- **Con:** Not all foods available offline (mitigated by API fallback)

### Decision: Authentication

**✅ Deferred to backend phase**
- Reason: MVP works with local-only data; accounts add complexity
- Implementation: Later, via Supabase Auth

### Decision: Push Notifications

**✅ Deferred to native phase**
- Reason: Not critical for MVP; unreliable on web PWA
- Implementation: Via `expo-notifications` when needed

---

## Dependency Map

```
┌─────────────────────────────────────┐
│   React Native + Expo               │ (Core framework)
├─────────────────────────────────────┤
│ @react-navigation/native            │ (Routing)
│ @react-native-community/async-storage│ (Cross-platform storage)
│ expo-sqlite                         │ (Database)
│ zustand                             │ (State management)
├─────────────────────────────────────┤
│ Web (PWA)         Native (iOS/Android)     │
│ ├─ React Native Web │ ├─ Native modules    │
│ ├─ IndexedDB       │ ├─ SQLite            │
│ └─ Service Worker  │ └─ AsyncStorage      │
└─────────────────────────────────────┘
```

---

## File Size & Performance Targets

| Target | Bundle Size | Database Size | First Load |
|--------|-------------|---|---|
| Web (PWA) | ~200 KB (gzipped) | 5 MB (food index) | <2s (cached) |
| iOS | ~30 MB (app binary) | 100+ MB (bundled DB, optional) | <1s |
| Android | ~30 MB (app binary) | 100+ MB (bundled DB, optional) | <1s |

---

## Conclusion

This plan enables:
1. **Fast MVP validation** (start on web with zero platform fees)
2. **Shared codebase** (one React Native project, three outputs)
3. **Graceful scaling** (add backend, native features, accounts as needed)
4. **Clear roadmap** (MVP → validation → native → backend → advanced features)

The key insight: **Don't overengineer upfront.** Start with a compressed food index and local storage. Validate the product. Then scale intelligently to native, backend, and advanced features.
