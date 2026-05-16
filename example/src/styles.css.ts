import { style, createTheme } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 24,
});

export const heading = style({
  fontSize: 24,
  fontWeight: 'bold',
  color: '#333',
});

export const button = style({
  backgroundColor: '#0070f3',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '12px 24px',
  fontSize: 16,
  cursor: 'pointer',
  ':hover': {
    backgroundColor: '#0051a2',
  },
});

export const [themeClass, vars] = createTheme({
  color: {
    primary: '#764abc',
    secondary: '#61dafb',
  },
  spacing: {
    small: '8px',
    medium: '16px',
    large: '32px',
  },
});

export const themedBox = style({
  backgroundColor: vars.color.primary,
  color: 'white',
  padding: vars.spacing.medium,
  borderRadius: 12,
});
