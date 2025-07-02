// Popup script for Link Bug Reporter
let testResults = {};
let currentTab = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  
  // Initialize UI
  initializeUI();
  
  // Check if testing is already in progress
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'getResults' });
    if (response && response.results && Object.keys(response.results).length > 0) {
      testResults = response.results;
      showResults();
    }
  } catch (error) {
    // Content script not loaded or no results yet
  }
});

function initializeUI() {
  const startBtn = document.getElementById('startTesting');
  const generateBtn = document.getElementById('generateReport');
  const resetBtn = document.getElementById('reset');
  
  startBtn.addEventListener('click', startTesting);
  generateBtn.addEventListener('click', generateReport);
  resetBtn.addEventListener('click', resetTesting);
}

async function startTesting() {
  try {
    showStatus('Starting link testing mode...', 'info');
    
    // Inject content script and start testing
    await chrome.tabs.sendMessage(currentTab.id, { action: 'startTesting' });
    
    showStatus('Click on links in the webpage to select them for testing', 'info');
    updateUI('testing');
    
  } catch (error) {
    showStatus('Error: Please refresh the page and try again', 'warning');
    console.error('Error starting testing:', error);
  }
}

function updateUI(state) {
  const startBtn = document.getElementById('startTesting');
  const generateBtn = document.getElementById('generateReport');
  const resetBtn = document.getElementById('reset');
  
  switch (state) {
    case 'testing':
      startBtn.style.display = 'none';
      generateBtn.style.display = 'none';
      resetBtn.style.display = 'block';
      break;
    case 'results':
      startBtn.style.display = 'none';
      generateBtn.style.display = 'block';
      resetBtn.style.display = 'block';
      break;
    case 'initial':
    default:
      startBtn.style.display = 'block';
      generateBtn.style.display = 'none';
      resetBtn.style.display = 'none';
      break;
  }
}

function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status status-${type}`;
  statusDiv.style.display = 'block';
}

function showResults() {
  const resultsDiv = document.getElementById('results');
  const resultsList = document.getElementById('resultsList');
  
  resultsList.innerHTML = '';
  
  let workingCount = 0;
  let brokenCount = 0;
  
  Object.entries(testResults).forEach(([url, result]) => {
    const item = document.createElement('div');
    item.className = `result-item ${result.working ? 'result-working' : 'result-broken'}`;
    
    const icon = document.createElement('div');
    icon.className = `status-icon ${result.working ? 'working' : 'broken'}`;
    
    const text = document.createElement('div');
    text.className = 'link-text';
    text.textContent = url;
    text.title = url;
    
    item.appendChild(icon);
    item.appendChild(text);
    resultsList.appendChild(item);
    
    if (result.working) {
      workingCount++;
    } else {
      brokenCount++;
    }
  });
  
  resultsDiv.style.display = 'block';
  
  const summary = brokenCount > 0 
    ? `Found ${brokenCount} broken link${brokenCount > 1 ? 's' : ''} out of ${Object.keys(testResults).length} tested`
    : `All ${workingCount} links are working correctly`;
    
  showStatus(summary, brokenCount > 0 ? 'warning' : 'success');
  updateUI('results');
}

async function generateReport() {
  try {
    showStatus('Generating report...', 'info');
    
    // Take screenshot
    const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    // Generate email content
    const emailContent = generateEmailContent();
    
    // Create mailto link
    const subject = encodeURIComponent(`Link Issue Report - ${currentTab.title}`);
    const body = encodeURIComponent(emailContent);
    const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
    
    // Open email client
    chrome.tabs.create({ url: mailtoLink });
    
    showStatus('Email report generated! Check your email client.', 'success');
    
  } catch (error) {
    showStatus('Error generating report. Please try again.', 'warning');
    console.error('Error generating report:', error);
  }
}

function generateEmailContent() {
  const workingLinks = [];
  const brokenLinks = [];
  
  Object.entries(testResults).forEach(([url, result]) => {
    if (result.working) {
      workingLinks.push(url);
    } else {
      brokenLinks.push({ url, error: result.status || result.error || 'Unknown error' });
    }
  });
  
  let content = `LINK BUG REPORT
================

Page URL: ${currentTab.url}
Page Title: ${currentTab.title}
Report Date: ${new Date().toLocaleString()}
Total Links Tested: ${Object.keys(testResults).length}

`;

  if (brokenLinks.length > 0) {
    content += `🔴 BROKEN LINKS (${brokenLinks.length}):
`;
    brokenLinks.forEach((link, index) => {
      content += `${index + 1}. ${link.url}
   Error: ${link.error}

`;
    });
  }
  
  if (workingLinks.length > 0) {
    content += `✅ WORKING LINKS (${workingLinks.length}):
`;
    workingLinks.forEach((url, index) => {
      content += `${index + 1}. ${url}
`;
    });
  }
  
  content += `

---
Generated by Link Bug Reporter Chrome Extension`;
  
  return content;
}

async function resetTesting() {
  try {
    await chrome.tabs.sendMessage(currentTab.id, { action: 'stopTesting' });
  } catch (error) {
    // Content script may not be loaded
  }
  
  testResults = {};
  document.getElementById('results').style.display = 'none';
  document.getElementById('status').style.display = 'none';
  updateUI('initial');
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testingComplete' && request.results) {
    testResults = request.results;
    showResults();
  }
});