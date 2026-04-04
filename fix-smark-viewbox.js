const fs = require('fs');

// The S mark paths span roughly x:510-660, y:75-185 in the original SVG
// Let's add padding and use exact bounds
const sMarkDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="500 55 200 150">
  <rect x="500" y="55" width="200" height="150" rx="22" fill="#1A6BFF"/>
  <path fill="white" d="M604.81,129.6l-5.66,9.99c-4.03,6.85-9.49,12.71-21.52,12.71h-47.9l-15.32,27.99h77.02c14.69,0,28.2-8.39,35.15-21.84l14.77-28.59-36.54-.26Z"/>
  <path fill="white" d="M578.23,131.94l6.22-10.86c4.47-7.6,12.22-11.41,19.79-11.41h47.53l14.79-28.63h-75.22c-13.98,0-26.88,7.8-33.79,20.42l-16.69,30.48h37.35Z"/>
</svg>`;

fs.writeFileSync('public\\s-mark-dark.svg', sMarkDark);
console.log('updated');
