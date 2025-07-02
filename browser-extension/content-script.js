// Link Bug Reporter Content Script
let isTestingMode = false;
let selectedLinks = new Set();
let testedLinks = new Map();

// Create overlay UI
function createOverlay() {
  if (document.getElementById('link-bug-reporter-overlay')) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'link-bug-reporter-overlay';
  overlay.innerHTML = `
    <div class="lbr-banner">
      <div class="lbr-banner-content">
        <span class="lbr-banner-text">🔗 Click on links to select them for testing</span>
        <div class="lbr-banner-actions">
          <button class="lbr-btn lbr-btn-test" id="lbr-test-selected">Test Selected Links</button>
          <button class="lbr-btn lbr-btn-close" id="lbr-close">×</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Add event listeners
  document.getElementById('lbr-test-selected').addEventListener('click', testSelectedLinks);
  document.getElementById('lbr-close').addEventListener('click', stopTesting);
}

// Remove overlay
function removeOverlay() {
  const overlay = document.getElementById('link-bug-reporter-overlay');
  if (overlay) {
    overlay.remove();
  }
}

// Start testing mode
function startTesting() {
  isTestingMode = true;
  selectedLinks.clear();
  testedLinks.clear();
  
  createOverlay();
  addLinkHandlers();
  updateBanner();
}

// Stop testing mode
function stopTesting() {
  isTestingMode = false;
  removeOverlay();
  removeLinkHandlers();
  clearHighlights();
}

// Add click handlers to all links
function addLinkHandlers() {
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    link.addEventListener('click', handleLinkClick, true);
    link.classList.add('lbr-selectable');
  });
}

// Remove link handlers
function removeLinkHandlers() {
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    link.removeEventListener('click', handleLinkClick, true);
    link.classList.remove('lbr-selectable', 'lbr-selected', 'lbr-working', 'lbr-broken', 'lbr-testing');
  });
}

// Clear all highlights
function clearHighlights() {
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    link.classList.remove('lbr-selected', 'lbr-working', 'lbr-broken', 'lbr-testing');
  });
}

// Handle link click in testing mode
function handleLinkClick(event) {
  if (!isTestingMode) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  const link = event.currentTarget;
  const href = link.href;
  
  if (selectedLinks.has(href)) {
    selectedLinks.delete(href);
    link.classList.remove('lbr-selected');
  } else {
    selectedLinks.add(href);
    link.classList.add('lbr-selected');
  }
  
  updateBanner();
}

// Update banner text
function updateBanner() {
  const banner = document.querySelector('.lbr-banner-text');
  const testBtn = document.getElementById('lbr-test-selected');
  
  if (banner) {
    if (selectedLinks.size === 0) {
      banner.textContent = '🔗 Click on links to select them for testing';
      testBtn.disabled = true;
    } else {
      banner.textContent = `🔗 ${selectedLinks.size} link${selectedLinks.size > 1 ? 's' : ''} selected`;
      testBtn.disabled = false;
    }
  }
}

// Test selected links
async function testSelectedLinks() {
  if (selectedLinks.size === 0) return;
  
  const banner = document.querySelector('.lbr-banner-text');
  const testBtn = document.getElementById('lbr-test-selected');
  
  testBtn.disabled = true;
  banner.textContent = '⏳ Testing links...';
  
  // Mark all selected links as testing
  document.querySelectorAll('a[href]').forEach(link => {
    if (selectedLinks.has(link.href)) {
      link.classList.add('lbr-testing');
      link.classList.remove('lbr-selected');
    }
  });
  
  // Test each link
  const promises = Array.from(selectedLinks).map(href => testLink(href));
  const results = await Promise.allSettled(promises);
  
  // Update UI with results
  results.forEach((result, index) => {
    const href = Array.from(selectedLinks)[index];
    const status = result.status === 'fulfilled' ? result.value : { working: false, error: result.reason };
    testedLinks.set(href, status);
    
    // Update link appearance
    document.querySelectorAll('a[href]').forEach(link => {
      if (link.href === href) {
        link.classList.remove('lbr-testing');
        link.classList.add(status.working ? 'lbr-working' : 'lbr-broken');
      }
    });
  });
  
  banner.textContent = `✅ Testing complete! ${testedLinks.size} links tested`;
  
  // Send results to popup
  chrome.runtime.sendMessage({
    action: 'testingComplete',
    results: Object.fromEntries(testedLinks)
  });
}

// Test individual link
async function testLink(href) {
  try {
    // Handle different protocols
    if (href.startsWith('mailto:') || href.startsWith('tel:')) {
      return { working: true, status: 'Valid protocol link' };
    }
    
    if (href.startsWith('#')) {
      // Check if anchor exists
      const elementId = href.substring(1);
      const element = document.getElementById(elementId) || document.querySelector(`[name="${elementId}"]`);
      return { working: !!element, status: element ? 'Anchor found' : 'Anchor not found' };
    }
    
    // Test HTTP/HTTPS links
    const response = await fetch(href, { 
      method: 'HEAD',
      mode: 'no-cors'
    });
    
    return { working: true, status: 'Link accessible' };
  } catch (error) {
    // Try with GET request if HEAD fails
    try {
      const response = await fetch(href, { 
        method: 'GET',
        mode: 'no-cors'
      });
      return { working: true, status: 'Link accessible' };
    } catch (getError) {
      return { working: false, status: 'Link not accessible', error: getError.message };
    }
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startTesting') {
    startTesting();
    sendResponse({ success: true });
  } else if (request.action === 'stopTesting') {
    stopTesting();
    sendResponse({ success: true });
  } else if (request.action === 'getResults') {
    sendResponse({ results: Object.fromEntries(testedLinks) });
  } else if (request.action === 'takeScreenshot') {
    // Screenshot will be handled by the popup/background script
    sendResponse({ success: true });
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (isTestingMode) {
    stopTesting();
  }
});