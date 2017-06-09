const SOFA = require('sofa-js')
const { COMMANDS } = require('./constants')

function sendMessage(session, message) {
  session.reply(message)
}

function sendWelcomeMessage(session) {
  session.reply(SOFA.Message({
    body: "Hello from Revel!",
    controls: [
      {
        type: "button",
        label: "What's Revel?",
        value: COMMANDS.WHATS_REVEL,
      },
      {
        type: "button",
        label: "Get lucky!",
        value: COMMANDS.GET_LUCKY,
      },
      {
        type: "button",
        label: "Submit a url",
        value: COMMANDS.SUBMIT_URL,
      }
    ]
  }))
}

function sendMessageWithDefaultControls(session, message) {
  session.reply(SOFA.Message({
    body: message,
    controls: [
      {
        type: "button",
        label: "Get lucky!",
        value: COMMANDS.GET_LUCKY,
      },
      {
        type: "button",
        label: "Submit a url",
        value: COMMANDS.SUBMIT_URL,
      }
    ],
    showKeyboard: false,
  }))
}

function sendMessageWithCancelOption(session, message) {
  session.reply(SOFA.Message({
    body: message,
    controls: [
      {
        type: "button",
        label: "Never mind",
        value: COMMANDS.START_OVER,
      },
    ],
    showKeyboard: false,
  }))
}

function sendMessageForGetLucky(session, message) {
  session.reply(SOFA.Message({
    body: message,
    controls: [
      {
        type: "button",
        label: "I like it!",
        value: COMMANDS.LIKE,
      },
      {
        type: "button",
        label: "Show me more",
        value: COMMANDS.SHOW_MORE_URL,
      },
      {
        type: "button",
        label: "Start over",
        value: COMMANDS.START_OVER,
      },
    ],
    showKeyboard: false,
  }))
}

function sendMessageForDonationQuestion(session, message) {
  session.reply(SOFA.Message({
    body: message,
    controls: [
      {
        type: "button",
        label: "Yes I do!",
        value: COMMANDS.WANT_TO_DONATE,
      },
      {
        type: "button",
        label: "Never mind",
        value: COMMANDS.START_OVER,
      },
    ],
    showKeyboard: false,
  }))
}

function sendMessageForDonationAmount(session, message) {
  session.reply(SOFA.Message({
    body: message,
    showKeyboard: true,
  }))
}

function sendPayment(session, paymentInfo) {
  session.reply(SOFA.Payment(paymentInfo));
}

module.exports = {
  sendMessage,
  sendMessageWithDefaultControls,
  sendMessageWithCancelOption,
  sendMessageForGetLucky,
  sendMessageForDonationQuestion,
  sendMessageForDonationAmount,
  sendWelcomeMessage,
}
