// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface to the Registration contract's check API.
interface IRegistration {
    function isRegistered(address voter) external view returns (bool);
}

/// @title Voting
/// @notice Multi-proposal yes/no voting. A vote is rejected when:
///         - it falls outside the proposal's [start, end] window;
///         - the sender is not registered (Registration.isRegistered == false);
///         - the sender has already voted on the proposal (hashtable hit).
///         A successful vote increments the yes/no count and records the voter
///         in the per-proposal `hasVoted` hashtable so they cannot vote again.
contract Voting {
    address public owner;
    IRegistration public registration;

    struct Proposal {
        string topic;
        uint256 startTime; // unix seconds; voting allowed when block.timestamp >= startTime
        uint256 endTime;   // unix seconds; voting allowed when block.timestamp <= endTime
        uint256 yesCount;
        uint256 noCount;
        bool exists;
    }

    Proposal[] private proposals;

    // proposalId => voter address => has voted (the double-vote hashtable)
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(
        uint256 indexed proposalId,
        string topic,
        uint256 startTime,
        uint256 endTime
    );
    event Voted(uint256 indexed proposalId, address indexed voter, bool support);
    event OwnerTransferred(address indexed from, address indexed to);

    modifier onlyOwner() {
        require(msg.sender == owner, "Voting: not owner");
        _;
    }

    constructor(address registrationAddress) {
        require(registrationAddress != address(0), "Voting: zero registration");
        owner = msg.sender;
        registration = IRegistration(registrationAddress);
    }

    /// @notice Admin publishes a proposal with a configurable voting period.
    function createProposal(
        string calldata topic,
        uint256 startTime,
        uint256 endTime
    ) external onlyOwner returns (uint256 proposalId) {
        require(bytes(topic).length > 0, "Voting: empty topic");
        require(endTime > startTime, "Voting: end <= start");
        require(endTime > block.timestamp, "Voting: end in past");

        proposalId = proposals.length;
        proposals.push(
            Proposal({
                topic: topic,
                startTime: startTime,
                endTime: endTime,
                yesCount: 0,
                noCount: 0,
                exists: true
            })
        );
        emit ProposalCreated(proposalId, topic, startTime, endTime);
    }

    /// @notice Cast a vote. The sender's address is taken from the transaction
    ///         (msg.sender), so the voter cannot be spoofed.
    /// @param proposalId which proposal to vote on
    /// @param support true = yes, false = no
    function vote(uint256 proposalId, bool support) external {
        require(proposalId < proposals.length, "Voting: no such proposal");
        Proposal storage p = proposals[proposalId];

        require(block.timestamp >= p.startTime, "Voting: not started");
        require(block.timestamp <= p.endTime, "Voting: ended");
        require(registration.isRegistered(msg.sender), "Voting: not registered");
        require(!hasVoted[proposalId][msg.sender], "Voting: already voted");

        // Record first to follow checks-effects-interactions.
        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.yesCount += 1;
        } else {
            p.noCount += 1;
        }

        emit Voted(proposalId, msg.sender, support);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function getProposal(uint256 proposalId)
        external
        view
        returns (
            string memory topic,
            uint256 startTime,
            uint256 endTime,
            uint256 yesCount,
            uint256 noCount
        )
    {
        require(proposalId < proposals.length, "Voting: no such proposal");
        Proposal storage p = proposals[proposalId];
        return (p.topic, p.startTime, p.endTime, p.yesCount, p.noCount);
    }

    /// @notice Convenience: status flags for a voter on a proposal.
    function getVoteStatus(uint256 proposalId, address voter)
        external
        view
        returns (bool isRegistered, bool voted, bool active)
    {
        require(proposalId < proposals.length, "Voting: no such proposal");
        Proposal storage p = proposals[proposalId];
        isRegistered = registration.isRegistered(voter);
        voted = hasVoted[proposalId][voter];
        active = block.timestamp >= p.startTime && block.timestamp <= p.endTime;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Voting: zero address");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }
}
