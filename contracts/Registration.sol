// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Registration
/// @notice Registry of addresses allowed to vote. The Voting contract calls
///         `isRegistered` to decide whether an incoming vote is permitted.
contract Registration {
    address public owner;

    // The "check API": address => is this address registered?
    mapping(address => bool) private registered;

    event Registered(address indexed voter);
    event Unregistered(address indexed voter);
    event OwnerTransferred(address indexed from, address indexed to);

    modifier onlyOwner() {
        require(msg.sender == owner, "Registration: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        // Whoever deploys is registered by default so they can vote/test.
        registered[msg.sender] = true;
        emit Registered(msg.sender);
    }

    /// @notice Self-service registration: anyone can register their own address.
    function register() external {
        require(!registered[msg.sender], "Registration: already registered");
        registered[msg.sender] = true;
        emit Registered(msg.sender);
    }

    /// @notice Owner can register a voter on their behalf (e.g. via the backend).
    function registerVoter(address voter) external onlyOwner {
        require(!registered[voter], "Registration: already registered");
        registered[voter] = true;
        emit Registered(voter);
    }

    /// @notice Owner can batch-register voters.
    function registerVoters(address[] calldata voters) external onlyOwner {
        for (uint256 i = 0; i < voters.length; i++) {
            if (!registered[voters[i]]) {
                registered[voters[i]] = true;
                emit Registered(voters[i]);
            }
        }
    }

    /// @notice Owner can revoke a registration.
    function unregisterVoter(address voter) external onlyOwner {
        require(registered[voter], "Registration: not registered");
        registered[voter] = false;
        emit Unregistered(voter);
    }

    /// @notice The check API used by the Voting contract and the backend.
    /// @return true if `voter` is registered, false ("none") otherwise.
    function isRegistered(address voter) external view returns (bool) {
        return registered[voter];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Registration: zero address");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }
}
