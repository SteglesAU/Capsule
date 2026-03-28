import { useState, useEffect } from 'react';
import { Text } from 'react-native';
import { useLockStore } from '../stores/lockStore';
import { getNextUnlockDate, formatCountdown } from '../lib/timeUtils';

export function CountdownTimer() {
  const { unlockHour, unlockMinute } = useLockStore();
  const [display, setDisplay] = useState('');

  useEffect(() => {
    const update = () => {
      const next = getNextUnlockDate(unlockHour, unlockMinute);
      setDisplay(formatCountdown(next.getTime()));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [unlockHour, unlockMinute]);

  return (
    <Text className="text-5xl font-bold text-white text-center font-mono tracking-wider">
      {display}
    </Text>
  );
}
