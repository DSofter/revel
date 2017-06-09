const co = require('co')
const SOFA = require('sofa-js')

const Bot = require('./lib/Bot')
const Fiat = require('./lib/Fiat')
const unit = require('./lib/unit');

let bot = new Bot()

const COMMANDS = {
  GET_LUCKY: 'get_lucky',
  LIKE: 'like',
  SHOW_MORE_URL: 'show_more_url',
  START_OVER: 'start_over',
  SUBMIT_URL: 'submit_url',
  WANT_TO_DONATE: 'want_to_donate',
  WHATS_REVEL: 'whats_revel',
}

const STATES = {
  IDLE: 'idle',
  WAIT_FOR_URL: 'wait_for_url',
  WAIT_FOR_DONATION_AMOUNT: 'wait_for_donation_amount',
}

const KEY_TOP10 = 'top10'

// ROUTING

bot.onEvent = function(session, message) {
  switch (message.type) {
    case 'Init':
      welcome(session)
      break
    case 'Message':
      onMessage(session, message)
      break
    case 'Command':
      onCommand(session, message)
      break
    case 'Payment':
      onPayment(session, message)
      break
    case 'PaymentRequest':
      welcome(session)
      break
  }
}

function onMessage(session, message) {
  if (isWaitingForUrl(session)) {
    submitUrl(session, message.body)
  } else if (isWaitingForDonationAmount(session)) {
    donate(session, message.body)
  } else {
    // welcome(session)

    const userId = session.get('tokenId')
    bot.client.send(userId, "hello!")
    return

    Fiat.fetch().then(toEth => {
      const address = session.user.payment_address
      sendEth(session, address, toEth.USD(1), (session, error, result) => {
        if (error) {
          sendMessage(session, error)
        }
      })
    }).catch(error => {
      sendMessage(session, error)
    })
  }
}

function onCommand(session, command) {
  switch (command.content.value) {
    case COMMANDS.GET_LUCKY:
      getLucky(session)
      break
    case COMMANDS.LIKE:
      likeUrl(session)
      break
    case COMMANDS.SHOW_MORE_URL:
      getLucky(session)
      break
    case COMMANDS.START_OVER:
      resetSession(session)
      break
    case COMMANDS.SUBMIT_URL:
      waitForUrl(session)
      break
    case COMMANDS.WANT_TO_DONATE:
      wantToDonate(session)
      break
    case COMMANDS.WHATS_REVEL:
      intro(session)
      break
    }
}

function onPayment(session, message) {
  // console.log('onPayment')
  // console.log(message)
  if (message.fromAddress == session.config.paymentAddress) {
    // handle payments sent by the bot
    if (message.status == 'confirmed') {
      // perform special action once the payment has been confirmed
      // on the network
    } else if (message.status == 'error') {
      // oops, something went wrong with a payment we tried to send!
    }
  } else {
    // handle payments sent to the bot
    if (message.status == 'unconfirmed') {
      // payment has been sent to the ethereum network, but is not yet confirmed
      sendMessage(session, `Thanks for the payment! 🙏`);

      if (isWaitingForDonationAmount(session)) {
        resetSession(session)

        const userId = session.get('tokenId')
        bot.client.send(userId, "hello!")
      }
    } else if (message.status == 'confirmed') {
      // handle when the payment is actually confirmed!
    } else if (message.status == 'error') {
      sendMessage(session, `There was an error with your payment!🚫`);
    }
  }
}

// STATES

function welcome(session) {
  session.reply(SOFA.Message({
    body: "Hello from Revel!",
    controls: [
      {
        type: "button",
        label: "What's Revel",
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

function intro(session) {
  session.reply("Revel is a service that helps you discover useful information on the web.")

  message = "Click “Get lucky” to see what people are sharing.\n\n" +
            "Click “Submit a url” to share something interesting."

  sendMessageWithDefaultControls(session, message)
}

function waitForUrl(session) {
  session.setState(STATES.WAIT_FOR_URL)
  sendMessageWithCancelOption(session, 'Please send the url')
}

function isWaitingForUrl(session) {
  return session.get('_state') == STATES.WAIT_FOR_URL
}

function doneWaitingForUrl(session) {
  session.setState(STATES.IDLE)
}

function resetSession(session) {
  session.setState(STATES.IDLE)
  sendMessageWithDefaultControls(session, 'What may I be of service?')
}

function submitUrl(session, url) {
  if (!isUrl(url)) {
    sendMessageWithCancelOption(session, 'Invalid URL, please send again')
    return
  }

  co(function* () {
    const urlInfo = yield bot.client.store.getKey(url)
    if (urlInfo != null) {
      sendMessageWithCancelOption(session, 'This url has been submitted, try another one:)')
      urlInfo.reputation += 1
      yield saveUrl(url, urlInfo)
    } else {
      const urlInfo = {
        contributor_token_id: session.get('tokenId'),
        contributor_payment_address: session.user.payment_address,
        reputation: 0,
      }

      yield saveUrl(url, urlInfo)

      doneWaitingForUrl(session)
      sendMessageWithDefaultControls(session, 'Add url successful!')
    }
  }).catch(error => {
    console.log(error)
    sendMessage(session, error)
  })
}

function saveUrl(url, urlInfo) {
  return bot.client.store.setKey(url, urlInfo).then(() => {
    return updateTop10(url, urlInfo)
  })
}

function toTop10Record(url, urlInfo) {
  return {
    url,
    contributor_token_id: urlInfo.contributor_token_id,
    contributor_payment_address: urlInfo.contributor_payment_address,
    reputation: urlInfo.reputation,
  }
}

function updateTop10(url, urlInfo) {
  return bot.client.store.getKey(KEY_TOP10).then(top10 => {
    // top10: [{url:, contributor_token_id:, contributor_payment_address:, reputation:}, ...]

    // save top 10 if there isn't any
    if (top10 == null) {
      top10 = [toTop10Record(url, urlInfo)]
      return bot.client.store.setKey(KEY_TOP10, top10)
    }

    // update reputation score if url is already in top 10
    const match = top10.find(elem => { return elem.url === url })
    if (match != null) {
      // update reputation score only
      top10[top10.indexOf(match)].reputation = urlInfo.reputation
      return bot.client.store.setKey(KEY_TOP10, top10)
    }

    if (top10.length < 10) {
      // add to top 10 if there's still space
      top10.push(toTop10Record(url, urlInfo))
      return bot.client.store.setKey(KEY_TOP10, top10)
    } else {
      // kick out the least popular url from the top 10 if necessary
      const leastPopularUrl = top10.reduce((url1, url2) => {
        return url1.reputation < url2.reputation ? url1 : url2
      })
      if (leastPopularUrl.reputation < urlInfo.reputation) {
        top10[top10.indexOf(leastPopularUrl)] = toTop10Record(url, urlInfo)
        return bot.client.store.setKey(KEY_TOP10, top10)
      }
      return new Promise()
    }
  })
}

function getLucky(session) {
  co(function* () {
    const top10 = yield bot.client.store.getKey(KEY_TOP10)
    if (top10 == null) {
      sendMessageWithDefaultControls(session, 'It’s an empty world, share something to make it beautiful!')
    } else {
      console.log(top10)
      console.log(top10.length)
      const randomIndex = Math.floor(Math.random() * top10.length)
      console.log(randomIndex)

      setCurrentLuckyUrl(session, top10[randomIndex].url)
      sendMessageForGetLucky(session, top10[randomIndex].url)
    }
  }).catch(error => {
    console.log(error)
    sendMessage(session, error)
  })
}

function setCurrentLuckyUrl(session, url) {
  session.set('lucky_url', url)
}

function getCurrentLuckyUrl(session) {
  return session.get('lucky_url')
}

function likeUrl(session) {
  const url = getCurrentLuckyUrl(session)
  if (url == null) {
    resetSession(session)
  } else {
    co(function* () {
      const urlInfo = yield bot.client.store.getKey(url)
      if (urlInfo == null) {
        yield Promise.reject('Something went wrong')
        return
      } else {
        urlInfo.reputation += 1
        yield saveUrl(url, urlInfo)
        sendMessageForDonationQuestion(session, 'Thanks! Would you like to donate the contributor of this url?')
      }
    }).catch(error => {
      console.log(error)
      sendMessage(session, error)
    })
  }
}

function wantToDonate(session) {
  const url = getCurrentLuckyUrl(session)
  if (url == null) {
    resetSession(session)
  } else {
    co(function* () {
      const urlInfo = yield bot.client.store.getKey(url)
      waitForDonationAmount(session)
      sendMessageForDonationAmount(session, 'How much US dollars would you like to donate?')
    }).catch(error => {
      console.log(error)
      sendMessage(session, error)
    })
  }
}

function waitForDonationAmount(session) {
  session.setState(STATES.WAIT_FOR_DONATION_AMOUNT)
}

function isWaitingForDonationAmount(session) {
  return session.get('_state') == STATES.WAIT_FOR_DONATION_AMOUNT
}

function donate(session, amountStr) {
  if (!isPositiveNumber(amountStr)) {
    sendMessageWithCancelOption(session, 'Invalid number, please try again:(')
    return
  }

  const amount = parseInt(amountStr)
  Fiat.fetch().then(toEth => {
    const ethAmount = toEth.USD(amount)
    session.requestEth(ethAmount, 'Url donation')
    sendMessageWithCancelOption(session, 'You can savely pay the contributor with Ether')
  })
}

// HELPERS

function sendMessage(session, message) {
  session.reply(message)
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

// Payment helper methods

function sendEth(session, address, value, callback) {
  value = '0x' + unit.toWei(value, 'ether').toString(16)
  sendWei(session, address, value, callback);
}

function sendWei(session, address, value, callback) {
  if (!address) {
    if (callback) {
      callback(session, "Cannot send transactions to users with no payment address", null);
    }
    return;
  }
  bot.client.rpc(session, {
    method: "sendTransaction",
    params: {
      to: address,
      value: value
    }
  }, (session, error, result) => {
    if (result) {
      session.reply(SOFA.Payment({
        status: "unconfirmed",
        value: value,
        txHash: result.txHash,
        fromAddress: session.get('tokenId'),
        toAddress: address,
      }));
    }
    if (callback) { callback(session, error, result); }
  });
}

// Utility functions

function isUrl(str) {
  const urlRegex = '/^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$/';
  const url = new RegExp(urlRegex, 'i');
  return str.length < 2083 && url.test(str);
}

function isPositiveNumber(str) {
  return /^[+]?([0-9]+(?:[\.][0-9]*)?|\.[0-9]+)$/.test(str)
}
