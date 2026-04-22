import { View, Text, StyleSheet } from 'react-native';

export default function ExerciseScreen() {
  return (
    <View style={styles.container}>
      <Text>Exercise Placeholder</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
