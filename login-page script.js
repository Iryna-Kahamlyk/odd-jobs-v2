function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Grab elements
const loginTabBtn = document.getElementById('login-tab-btn');
const signupTabBtn = document.getElementById('signup-tab-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const googleBtn = document.getElementById('signin-button');

// functions are using the variables declared to show which are hidden and which are active
// to change what appears on button press
function showLogin() {
  loginForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
  loginTabBtn.classList.add('active');
  signupTabBtn.classList.remove('active');
  loginError.textContent = '';
  signupError.textContent = '';
}

function showSignup() {
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  signupTabBtn.classList.add('active');
  loginTabBtn.classList.remove('active');
  loginError.textContent = '';
  signupError.textContent = '';
}

loginTabBtn.addEventListener('click', showLogin);
signupTabBtn.addEventListener('click', showSignup);

// google autofill when pressed with the demo user info
// e prevents the default browser behaviour like form submit
googleBtn.addEventListener('click', (e) => {
  e.preventDefault(); 

  const demoUser = 'google.user@example.com';
  const demoPass = 'google1234';

  const loginUserInput = document.getElementById('login-username');
  const loginPassInput = document.getElementById('login-password');
  if (loginUserInput) loginUserInput.value = demoUser;
  if (loginPassInput) loginPassInput.value = demoPass;

  const signupUserInput = document.getElementById('signup-username');
  const signupPassInput = document.getElementById('signup-password');
  if (signupUserInput) signupUserInput.value = demoUser;
  if (signupPassInput) signupPassInput.value = demoPass;
});

// 1) LOGIN FORM → redirect to index.html
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const user = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value.trim();

  if (!user || !pass) {
    loginError.textContent = 'Please enter email and password.';
    return;
  }

  // Optional: also check valid email
  if (!validateEmail(user)) {
    loginError.textContent = 'Must be a valid email ID.';
    return;
  }

  // ✅ Go to main app
  window.location.href = 'index.html';
});

// 2) SIGNUP FORM → first time creates account, then button becomes "Login" and redirects
const signupSubmitBtn = signupForm.querySelector('.submit-btn');

function handleSignupSubmit(e) {
  e.preventDefault();
  signupError.textContent = '';

  const user = document.getElementById('signup-username').value.trim();
  const pass = document.getElementById('signup-password').value.trim();

  if (!validateEmail(user)) {
    signupError.textContent = 'Must be a valid email ID.';
    return;
  }
  if (pass.length < 4) {
    signupError.textContent = 'Password must be at least 4 characters.';
    return;
  }

  // Fake "account created"
  alert('Account created for ' + user);

  // Change the green button text to "Login"
  if (signupSubmitBtn) {
    signupSubmitBtn.textContent = 'Login';
  }

  // Next submits on this form should just redirect to index.html
  signupForm.removeEventListener('submit', handleSignupSubmit);
  signupForm.addEventListener('submit', function (e2) {
    e2.preventDefault();
    window.location.href = 'index.html';
  });
}

signupForm.addEventListener('submit', handleSignupSubmit);