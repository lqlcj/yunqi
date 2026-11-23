import { useTheme, setTheme, type ThemePreference } from '../lib/theme';
import { Icon } from './Icon';

export function ThemePicker() {
  const value = useTheme();
  const choices: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'system', label: '跟随系统', icon: 'monitor' },
    { value: 'light', label: '浅色', icon: 'sun' },
    { value: 'dark', label: '深色', icon: 'moon' },
  ];
  return <div className="theme-picker" role="group" aria-label="外观模式">{choices.map(choice =>
    <button key={choice.value} type="button" aria-pressed={value === choice.value} onClick={() => setTheme(choice.value)}>
      <Icon name={choice.icon} size={16} /><span>{choice.label}</span>
    </button>
  )}</div>;
}
