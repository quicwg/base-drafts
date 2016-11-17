---
title: "QUIC: A UDP-Based Multiplexed and Secure Transport"
abbrev: QUIC Transport Protocol
docname: draft-ietf-quic-transport-protocol-latest
category: std
ipr: trust200902

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
 -
    ins: R. Hamilton
    name: Ryan Hamilton
    org: Google
    email: rch@google.com
 -
    ins: J. Iyengar
    name: Jana Iyengar
    org: Google
    email: jri@google.com
 -
    ins: I. Swett
    name: Ian Swett
    org: Google
    email: ianswett@google.com
 -
    ins: A. Wilk
    name: Alyssa Wilk
    org: Google
    email: alyssar@google.com

normative:


informative:


--- abstract

QUIC is a multiplexed and secure transport protocol that runs on top
of UDP.  QUIC builds on past transport experience, and implements
mechanisms that make it useful as a modern general-purpose transport
protocol.  Using UDP as the basis of QUIC is intended to address
compatibility issues with legacy clients and middleboxes.  QUIC
authenticates all of its headers, preventing third parties from from
changing them.  QUIC encrypts most of its headers, thereby limiting
protocol evolution to QUIC endpoints only.  Therefore, middleboxes, in
large part, are not required to be updated as new protocol versions
are deployed.  This document describes the core QUIC protocol,
including the conceptual design, wire format, and mechanisms of the
QUIC protocol for connection establishment, stream multiplexing,
stream and connection-level flow control, and data reliability.
Accompanying documents describe QUIC's loss recovery and congestion
control, and the use of TLS 1.3 for key negotiation.

--- middle

# Introduction

QUIC is a multiplexed and secure transport protocol that runs on top
of UDP.  QUIC builds on past transport experience and implements
mechanisms that make it useful as a modern general-purpose transport
protocol.  Using UDP as the substrate, QUIC seeks to be compatible
with legacy clients and middleboxes.  QUIC authenticates all of its
headers, preventing middleboxes and other third parties from changing
them, and encrypts most of its headers, limiting protocol evolution
largely to QUIC endpoints only.

This document describes the core QUIC protocol, including the
conceptual design, wire format, and mechanisms of the QUIC protocol
for connection establishment, stream multiplexing, stream and
connection-level flow control, and data reliability.  Accompanying
documents describe QUIC's loss detection and congestion control
{{!I-D.iyengar-quic-loss-recovery}}, and the use of TLS 1.3 for key
negotiation {{!I-D.thomson-quic-tls}}.

## Notational Conventions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.

# Security Considerations

# IANA Considerations

This document has no IANA actions yet.


--- back
