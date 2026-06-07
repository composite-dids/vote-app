i need you the following change: when connecting to a wallet, just don't check if this wallet has registered, only check it when the user vote through this wallet.

Basically when vote, first check locally about if the vote has voted  proposal, if so reject, I believe those are already reflected.

Then check votes' address because the voter is sending one trasaction to the vote smart contract, then the vote smart contract will check if such voter has voted for the proposal as well. Finally is the check to the registration contract, this is only a fetch from registration contract about if such address exist in the registration contract. 