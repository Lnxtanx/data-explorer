import { useMemo } from 'react';
import { useAuth } from '../context';
import { useUserProfile } from './useUserProfile';

export interface GreetingInfo {
  heading: string;
  subtitle: string;
  firstName: string;
  timePeriod: 'late_night' | 'early_morning' | 'morning' | 'afternoon' | 'evening';
}

export function useGreeting(): GreetingInfo {
  const { user } = useAuth();
  const { profile } = useUserProfile();

  const firstName = useMemo(() => {
    const raw = (
      profile?.full_name ||
      (profile as any)?.name ||
      (user as any)?.user_metadata?.full_name ||
      (user as any)?.user_metadata?.name ||
      user?.email?.split('@')[0] ||
      ''
    ).trim();

    if (!raw) return '';
    const clean = raw.replace(/\.[a-zA-Z0-9_-]+/g, '').trim() || raw;
    const first = clean.split(/\s+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }, [profile, user]);

  return useMemo(() => {
    const hour = new Date().getHours();
    let timePeriod: GreetingInfo['timePeriod'];
    let templates: string[];

    if (hour >= 23 || hour < 5) {
      timePeriod = 'late_night';
      templates = firstName
        ? [
            `${firstName} returns!`,
            `Night owl mode, ${firstName}!`,
            `Still awake, ${firstName}?`,
            `Burning the midnight oil, ${firstName}?`,
            `Late night queries, ${firstName}?`,
          ]
        : [
            'Night owl mode!',
            'Still awake?',
            'Burning the midnight oil!',
            'Late night data exploration!',
          ];
    } else if (hour >= 5 && hour < 7) {
      timePeriod = 'early_morning';
      templates = firstName
        ? [
            `Up with the birds, ${firstName}!`,
            `Early start today, ${firstName}!`,
            `Morning, ${firstName}!`,
            `${firstName} returns!`,
          ]
        : [
            'Up with the birds!',
            'Early start today!',
            'Good early morning!',
          ];
    } else if (hour >= 7 && hour < 12) {
      timePeriod = 'morning';
      templates = firstName
        ? [
            `Good morning, ${firstName}!`,
            `${firstName} returns!`,
            `Morning, ${firstName}!`,
            `Ready to query, ${firstName}?`,
          ]
        : [
            'Good morning!',
            'How can I help with your data today?',
            'Ready to explore your data?',
          ];
    } else if (hour >= 12 && hour < 17) {
      timePeriod = 'afternoon';
      templates = firstName
        ? [
            `Good afternoon, ${firstName}!`,
            `${firstName} returns!`,
            `Afternoon, ${firstName}!`,
            `Back at it, ${firstName}!`,
          ]
        : [
            'Good afternoon!',
            'How can I help with your data today?',
            'Back at it!',
          ];
    } else {
      timePeriod = 'evening';
      templates = firstName
        ? [
            `Good evening, ${firstName}!`,
            `${firstName} returns!`,
            `Evening, ${firstName}!`,
            `Back to the data, ${firstName}!`,
          ]
        : [
            'Good evening!',
            'How can I help with your data today?',
            'Back to the data!',
          ];
    }

    // Pick a deterministic yet natural template for this session
    // Uses minute & name hash to avoid random flicker while feeling varied
    const seed = (hour * 7 + (firstName.length || 3)) % templates.length;
    const heading = templates[seed] || templates[0];

    return {
      heading,
      subtitle: 'How can I help with your data today?',
      firstName,
      timePeriod,
    };
  }, [firstName]);
}

