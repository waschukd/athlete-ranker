const fs = require('fs');

// 1. Update layout.jsx with metadata
const layoutPath = 'src/app/layout.jsx';
let layout = fs.readFileSync(layoutPath, 'utf8');
layout = layout.replace(
  '"use client";\nimport "./globals.css";',
  '"use client";\nimport "./globals.css";\nimport Head from "next/head";'
);
layout = layout.replace(
  '    <html lang="en">\n      <body>',
  `    <html lang="en">
      <head>
        <title>Sideline Star</title>
        <meta name="description" content="Athlete evaluation and ranking platform" />
        <link rel="icon" href="/icon-light.png" />
      </head>
      <body>`
);
fs.writeFileSync(layoutPath, layout);
console.log('layout.jsx updated');

// 2. Update signin page - new branding
const signinPath = 'src/app/account/signin/page.jsx';
let signin = fs.readFileSync(signinPath, 'utf8');

// Background - navy
signin = signin.replace(
  'className="min-h-screen flex items-center justify-center px-4 bg-gray-50"',
  'className="min-h-screen flex items-center justify-center px-4" style={{background:"#080E1A"}}'
);

// Card - dark
signin = signin.replace(
  'className="w-full max-w-md bg-white border border-gray-200 rounded-xl p-8 shadow-sm"',
  'className="w-full max-w-md rounded-xl p-8" style={{background:"#0F1A2E",border:"1px solid rgba(255,255,255,0.08)"}}'
);

// Replace orange icon with logo
signin = signin.replace(
  `          <div className="mx-auto w-12 h-12 rounded-full bg-[#FF6B35] flex items-center justify-center mb-3">
            <LogIn className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
          <p className="text-sm text-gray-500 mt-1">Access your admin and evaluator tools</p>`,
  `          <img src="/logo-dark.png" alt="Sideline Star" className="mx-auto mb-6" style={{height:"80px",objectFit:"contain"}} />
          <h1 className="text-2xl font-semibold" style={{color:"#E8F0FF"}}>Sign in</h1>
          <p className="text-sm mt-1" style={{color:"#4D8FFF"}}>Access your admin and evaluator tools</p>`
);

// Label colors
signin = signin.replace(/className="block text-sm font-medium text-gray-700 mb-1"/g, 'className="block text-sm font-medium mb-1" style={{color:"#A0B4D0"}}');
signin = signin.replace(/className="block text-sm font-medium text-gray-700"/g, 'className="block text-sm font-medium" style={{color:"#A0B4D0"}}');

// Input borders - blue tint
signin = signin.replace(/focus-within:ring-\[#FF6B35\]/g, 'focus-within:ring-[#1A6BFF]');

// Forgot password link
signin = signin.replace('className="text-xs text-[#FF6B35] hover:underline"', 'className="text-xs hover:underline" style={{color:"#4D8FFF"}}');

// Submit button
signin = signin.replace(
  'className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-white bg-[#FF6B35] hover:bg-[#E55A2E] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"',
  'className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors" style={{background:"#1A6BFF"}}'
);

// Input text colors
signin = signin.replace(/className="w-full outline-none text-gray-900 placeholder-gray-400 text-sm bg-transparent"/g, 'className="w-full outline-none text-sm bg-transparent" style={{color:"#E8F0FF"}}');

fs.writeFileSync(signinPath, signin);
console.log('signin page updated');
