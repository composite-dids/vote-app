const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Voting", function () {
  let registration, voting, owner, alice, bob, start, end;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const Registration = await ethers.getContractFactory("Registration");
    registration = await Registration.deploy();
    await registration.waitForDeployment();

    const Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy(await registration.getAddress());
    await voting.waitForDeployment();

    const now = await time.latest();
    start = now + 10;
    end = now + 3600;
    await voting.createProposal("Adopt proposal X?", start, end);
  });

  it("rejects votes before the start time", async function () {
    await registration.registerVoter(alice.address);
    await expect(voting.connect(alice).vote(0, true)).to.be.revertedWith(
      "Voting: not started"
    );
  });

  it("rejects unregistered voters", async function () {
    await time.increaseTo(start + 1);
    await expect(voting.connect(bob).vote(0, true)).to.be.revertedWith(
      "Voting: not registered"
    );
  });

  it("accepts a registered voter and increments the count", async function () {
    await registration.registerVoter(alice.address);
    await time.increaseTo(start + 1);
    await voting.connect(alice).vote(0, true);
    const p = await voting.getProposal(0);
    expect(p.yesCount).to.equal(1n);
    expect(p.noCount).to.equal(0n);
    expect(await voting.hasVoted(0, alice.address)).to.equal(true);
  });

  it("blocks double voting", async function () {
    await registration.registerVoter(alice.address);
    await time.increaseTo(start + 1);
    await voting.connect(alice).vote(0, false);
    await expect(voting.connect(alice).vote(0, true)).to.be.revertedWith(
      "Voting: already voted"
    );
  });

  it("rejects votes after the end time", async function () {
    await registration.registerVoter(alice.address);
    await time.increaseTo(end + 1);
    await expect(voting.connect(alice).vote(0, true)).to.be.revertedWith(
      "Voting: ended"
    );
  });

  it("only the owner can create proposals", async function () {
    await expect(
      voting.connect(alice).createProposal("Sneaky", start, end)
    ).to.be.revertedWith("Voting: not owner");
  });

  it("tallies yes and no across voters", async function () {
    await registration.registerVoter(alice.address);
    await registration.registerVoter(bob.address);
    await time.increaseTo(start + 1);
    await voting.connect(alice).vote(0, true);
    await voting.connect(bob).vote(0, false);
    const p = await voting.getProposal(0);
    expect(p.yesCount).to.equal(1n);
    expect(p.noCount).to.equal(1n);
  });
});
