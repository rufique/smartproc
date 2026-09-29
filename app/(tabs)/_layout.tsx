import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

const TABS: {
  name: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { name: 'index', title: 'Dashboard', icon: 'home-outline', activeIcon: 'home' },
  { name: 'catalog', title: 'Catalog', icon: 'document-text-outline', activeIcon: 'document-text' },
  { name: 'procure', title: 'Procure', icon: 'cart-outline', activeIcon: 'cart' },
  {
    name: 'suggestions',
    title: 'Suggestions',
    icon: 'stats-chart-outline',
    activeIcon: 'stats-chart',
  },
  { name: 'profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2F6FEB',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderRadius: 30,
          borderWidth: 0,
          marginHorizontal: 12,
          marginBottom: Platform.OS === 'ios' ? 10 : 16,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          position: 'absolute',
          shadowColor: '#0F172B',
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
        tabBarItemStyle: { marginHorizontal: 2 },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <View
                className={`items-center justify-center rounded-[10px] px-3 py-1 ${
                  focused ? 'bg-brand-light' : 'bg-transparent'
                }`}>
                <Ionicons name={focused ? tab.activeIcon : tab.icon} size={19} color={color} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
