const fs = require('fs');

// 1. Copy the real logo to public
fs.copyFileSync(
  'C:\\Users\\DBag\\Downloads\\Sideline star logo.svg',
  'public\\logo.svg'
);
console.log('logo.svg copied');

// 2. Create clean S-mark-only SVG (blue on transparent) for nav tiles
const sMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="510 65 175 120">
  <path fill="#5a99f5" d="M604.81,129.6l-5.66,9.99c-4.03,6.85-9.49,12.71-21.52,12.71h-47.9l-15.32,27.99h77.02c14.69,0,28.2-8.39,35.15-21.84l14.77-28.59-36.54-.26Z"/>
  <path fill="#5a99f5" d="M578.23,131.94l6.22-10.86c4.47-7.6,12.22-11.41,19.79-11.41h47.53l14.79-28.63h-75.22c-13.98,0-26.88,7.8-33.79,20.42l-16.69,30.48h37.35Z"/>
</svg>`;
fs.writeFileSync('public\\s-mark.svg', sMarkSvg);
console.log('s-mark.svg created');

// 3. Create dark version (white mark on navy) for dark backgrounds
const sMarkDarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="490 55 195 140">
  <rect x="490" y="55" width="195" height="140" rx="20" fill="#080E1A"/>
  <path fill="#5a99f5" d="M604.81,129.6l-5.66,9.99c-4.03,6.85-9.49,12.71-21.52,12.71h-47.9l-15.32,27.99h77.02c14.69,0,28.2-8.39,35.15-21.84l14.77-28.59-36.54-.26Z"/>
  <path fill="#5a99f5" d="M578.23,131.94l6.22-10.86c4.47-7.6,12.22-11.41,19.79-11.41h47.53l14.79-28.63h-75.22c-13.98,0-26.88,7.8-33.79,20.42l-16.69,30.48h37.35Z"/>
</svg>`;
fs.writeFileSync('public\\s-mark-dark.svg', sMarkDarkSvg);
console.log('s-mark-dark.svg created');

// 4. Create logo-light.svg - S mark + wordmark for light backgrounds (right half of original)
const logoLightSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="396 0 396 260">
  <g>
    <g>
      <path fill="#5a99f5" d="M604.81,129.6l-5.66,9.99c-4.03,6.85-9.49,12.71-21.52,12.71h-47.9l-15.32,27.99h77.02c14.69,0,28.2-8.39,35.15-21.84l14.77-28.59-36.54-.26Z"/>
      <path fill="#5a99f5" d="M578.23,131.94l6.22-10.86c4.47-7.6,12.22-11.41,19.79-11.41h47.53l14.79-28.63h-75.22c-13.98,0-26.88,7.8-33.79,20.42l-16.69,30.48h37.35Z"/>
    </g>
  </g>
</svg>`;
fs.writeFileSync('public\\logo-light-mark.svg', logoLightSvg);
console.log('logo-light-mark.svg created');

console.log('All assets created');
