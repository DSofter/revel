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

const KEYS = {
  LUCKY_URL: 'lucky_url',
  TOKEN_ID: 'tokenId',
  TOP10: 'top10',
  UNCONFIRMED_DONATIONS: 'unconfirmed_donations',
}

module.exports = {
  COMMANDS,
  STATES,
  KEYS,
}
