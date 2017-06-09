const SOFA = require('sofa-js')
const unit = require('./lib/unit');

function sendEth(bot, session, address, value, callback) {
  value = '0x' + unit.toWei(value, 'ether').toString(16)
  sendWei(bot, session, address, value, callback);
}

function sendWei(bot, session, address, value, callback) {
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
        fromAddress: session.user.payment_address,
        toAddress: address,
      }));
    }
    if (callback) { callback(session, error, result); }
  });
}

module.exports = {
  sendEth,
}
