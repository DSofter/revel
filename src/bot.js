const co = require('co')

const Bot = require('./lib/Bot')
const Fiat = require('./lib/Fiat')
const unit = require('./lib/unit');

const {
  COMMANDS,
  STATES,
  KEYS,
} = require('./constants')

const {
  sendMessage,
  sendMessageWithDefaultControls,
  sendMessageWithCancelOption,
  sendMessageForGetLucky,
  sendMessageForDonationQuestion,
  sendMessageForDonationAmount,
  sendWelcomeMessage,
} = require('./message')

const { sendEth } = require('./payments')

const {
  isPositiveNumber,
  isUrl,
  shuffleArray,
} = require('./utils')

let bot = new Bot()

// ROUTING

bot.onEvent = function(session, message) {
  switch (message.type) {
    case 'Init':
      sendWelcomeMessage(session)
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
      sendWelcomeMessage(session)
      break
  }
}

function onMessage(session, message) {
  if (isWaitingForUrl(session)) {
    submitUrl(session, message.body)
  } else if (isWaitingForDonationAmount(session)) {
    donate(session, message.body)
  } else {
    sendWelcomeMessage(session)
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
      sendMessage(session, `Thanks for the payment!`);
      handleUnconfirmedPayment(session, message)
    } else if (message.status == 'confirmed') {
      handleConfirmedPayment(session, message)
    } else if (message.status == 'error') {
      sendMessage(session, `There was an error with your payment!🚫`);
    }
  }
}

function handleUnconfirmedPayment(session, message) {
  if (isWaitingForDonationAmount(session)) {
    const unconfirmedDonations = session.get(KEYS.UNCONFIRMED_DONATIONS) || {}
    unconfirmedDonations[message.txHash] = getCurrentLuckyUrl(session)
    session.set(KEYS.UNCONFIRMED_DONATIONS, unconfirmedDonations)

    resetSession(session)
  }
}

function handleConfirmedPayment(session, message) {
  // Pay the contributor
  const unconfirmedDonations = session.get(KEYS.UNCONFIRMED_DONATIONS)
  if (unconfirmedDonations && unconfirmedDonations[message.txHash]) {
    const urlRecord = unconfirmedDonations[message.txHash]

    console.log(message.txHash)

    // Remove the donation from unconfirmed
    delete unconfirmedDonations[message.txHash]
    session.set(KEYS.UNCONFIRMED_DONATIONS, unconfirmedDonations)

    // Send the contributor ETH, woooohooo!
    bot.client.send(urlRecord.contributor_token_id,
                    'Someone sent you a donation for your url: ' + urlRecord.url)
    Fiat.fetch().then(toEth => {
      const address = urlRecord.contributor_payment_address
      const ethAmount = unit.fromWei(message.value, 'ether')
      sendEth(bot, session, address, ethAmount, (session, error, result) => {
        if (error) {
          sendMessage(session, error)
          console.log(error)
        } else {
          console.log('Payment successful!')
        }
      })
    })
  }
}

// Helper functions

function intro(session) {
  session.reply("Revel is a service that helps you discover interesting information on the web.")

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
  setCurrentLuckyUrl(session, null)
  sendMessageWithDefaultControls(session, 'What may I be of service?')
}

function submitUrl(session, url) {
  if (!isUrl(url)) {
    sendMessageWithCancelOption(session, 'Invalid url, please send again')
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
        contributor_token_id: session.get(KEYS.TOKEN_ID),
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
  return bot.client.store.getKey(KEYS.TOP10).then(top10 => {
    // top10: [{url:, contributor_token_id:, contributor_payment_address:, reputation:}, ...]

    // save top 10 if there isn't any
    if (top10 == null) {
      top10 = [toTop10Record(url, urlInfo)]
      return bot.client.store.setKey(KEYS.TOP10, top10)
    }

    // update reputation score if url is already in top 10
    const match = top10.find(elem => { return elem.url === url })
    if (match != null) {
      // update reputation score only
      top10[top10.indexOf(match)].reputation = urlInfo.reputation
      return bot.client.store.setKey(KEYS.TOP10, top10)
    }

    if (top10.length < 10) {
      // add to top 10 if there's still space
      top10.push(toTop10Record(url, urlInfo))
      return bot.client.store.setKey(KEYS.TOP10, top10)
    } else {
      // kick out the least popular url from the top 10 if necessary
      const leastPopularUrl = top10.reduce((url1, url2) => {
        return url1.reputation < url2.reputation ? url1 : url2
      })
      if (leastPopularUrl.reputation < urlInfo.reputation) {
        top10[top10.indexOf(leastPopularUrl)] = toTop10Record(url, urlInfo)
        return bot.client.store.setKey(KEYS.TOP10, top10)
      }
      return new Promise()
    }
  })
}

function getRandomIndex(session, size) {
  const viewUrlOrder = session.get(KEYS.VIEW_URL_ORDER) || []
  if (viewUrlOrder.length == 0) {
    Array.apply(null, {length: size}).forEach((elem, index) => {
      viewUrlOrder.push(index)
    })
    shuffleArray(viewUrlOrder)
  }

  const result = viewUrlOrder.pop()
  session.set(KEYS.VIEW_URL_ORDER, viewUrlOrder)

  if (viewUrlOrder.length == 0) {
    sendMessage(session, 'Oops, it looks like you have viewed all the urls we have now;)')
  }

  return result
}

function getLucky(session) {
  co(function* () {
    const top10 = yield bot.client.store.getKey(KEYS.TOP10)
    if (top10 == null) {
      sendMessageWithDefaultControls(session, 'It’s an empty world, share something to make it beautiful!')
    } else {
      console.log(top10)
      const randomIndex = getRandomIndex(session, top10.length)
      console.log(randomIndex)

      setCurrentLuckyUrl(session, top10[randomIndex])
      sendMessageForGetLucky(session, top10[randomIndex].url)
    }
  }).catch(error => {
    console.log(error)
    sendMessage(session, error)
  })
}

function setCurrentLuckyUrl(session, top10UrlRecord) {
  session.set(KEYS.LUCKY_URL, top10UrlRecord)
}

function getCurrentLuckyUrl(session) {
  return session.get(KEYS.LUCKY_URL)
}

function likeUrl(session) {
  const urlRecord = getCurrentLuckyUrl(session)
  if (urlRecord == null) {
    resetSession(session)
  } else {
    const url = urlRecord.url
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
    waitForDonationAmount(session)
    sendMessageForDonationAmount(session, 'How much US dollars would you like to donate?')
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

  const amount = Number(amountStr)
  Fiat.fetch().then(toEth => {
    const ethAmount = toEth.USD(amount)
    session.requestEth(ethAmount, 'Url donation')
    sendMessageWithCancelOption(session, 'You can safely pay the contributor with Ether')
  })
}
