const axios = require('axios');

// Test endpoint
async function testPay2SEndpoint() {
  try {
    console.log('Testing POST /topups/workspaces/test-workspace/create-with-pay2s...');
    
    const response = await axios.post('http://localhost:3000/topups/workspaces/test-workspace/create-with-pay2s', {
      amountExclVat: 100000,
      moneyAccountId: 'test-account-id'
    }, {
      headers: {
        'Content-Type': 'application/json'
        // Note: You'll need to add JWT token in real scenario
      }
    });
    
    console.log('✅ Endpoint exists!');
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Error response:');
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
}

testPay2SEndpoint();
