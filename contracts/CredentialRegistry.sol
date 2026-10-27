// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract CredentialRegistry {
    struct Record { address subject; address issuer; uint64 expiresAt; uint64 issuedAt; bool revoked; }
    address public immutable admin;
    mapping(address => bool) public issuers;
    mapping(bytes32 => Record) public records;
    event IssuerSet(address indexed issuer, bool authorized);
    event Issued(bytes32 indexed digest, address indexed subject, address indexed issuer, uint64 expiresAt);
    event Revoked(bytes32 indexed digest, address indexed issuer);
    constructor() { admin = msg.sender; issuers[msg.sender] = true; }
    function setIssuer(address issuer, bool authorized) external {
        require(msg.sender == admin, "Only admin");
        require(issuer != address(0), "Zero issuer");
        issuers[issuer] = authorized;
        emit IssuerSet(issuer, authorized);
    }
    function issue(bytes32 digest, address subject, uint64 expiresAt) external {
        require(issuers[msg.sender], "Unauthorized issuer");
        require(digest != bytes32(0) && subject != address(0), "Invalid credential");
        require(records[digest].issuer == address(0), "Already issued");
        require(expiresAt == 0 || expiresAt > block.timestamp, "Expiry in past");
        records[digest] = Record(subject, msg.sender, expiresAt, uint64(block.timestamp), false);
        emit Issued(digest, subject, msg.sender, expiresAt);
    }
    function revoke(bytes32 digest) external {
        Record storage record = records[digest];
        require(record.issuer == msg.sender, "Only original issuer");
        require(!record.revoked, "Already revoked");
        record.revoked = true;
        emit Revoked(digest, msg.sender);
    }
}
