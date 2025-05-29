const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate } = require('../middlewares/auth');

// Get chat history between two users
router.get('/history/:recipientId', authenticate, chatController.getChatHistory);

// Send a message
router.post('/send', authenticate, chatController.sendMessage);

// Get user's chat contacts
router.get('/contacts', authenticate, chatController.getChatContacts);

module.exports = router; 