/** Tokens sampled from the Figma screenshots. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#00A844', dark: '#008F3A', tint: '#E6F4EA', soft: '#F0FAF3' },
        field: '#F4F5F5',
        line: '#E8EAEA',
        ink: { DEFAULT: '#1A1A1A', muted: '#8A8F8F' },
        sched: { bg: '#FFE7D6', fg: '#B5541A' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], pixel: ['Silkscreen', 'monospace'] },
      fontSize: { xs: ['12px', '16px'], sm: ['13px', '18px'] },
    },
  },
  plugins: [],
};
