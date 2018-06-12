---
title: "Version-Independent Properties of QUIC"
abbrev: QUIC Invariants
docname: draft-ietf-quic-invariants-latest
date: {DATE}
category: std
ipr: trust200902
area: Transport
workgroup: QUIC

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
  -
    ins: M. Thomson
    name: Martin Thomson
    org: Mozilla
    email: martin.thomson@gmail.com

normative:

  QUIC-TRANSPORT:
    title: "QUIC: A UDP-Based Multiplexed and Secure Transport"
    date: {DATE}
    seriesinfo:
      Internet-Draft: draft-ietf-quic-transport-latest
    author:
      -
        ins: J. Iyengar
        name: Jana Iyengar
        org: Google
        role: editor
      -
        ins: M. Thomson
        name: Martin Thomson
        org: Mozilla
        role: editor

informative:

  QUIC-TLS:
    title: "Using Transport Layer Security (TLS) to Secure QUIC"
    date: {DATE}
    seriesinfo:
      Internet-Draft: draft-ietf-quic-tls-latest
    author:
      -
        ins: M. Thomson
        name: Martin Thomson
        org: Mozilla
        role: editor
      -
        ins: S. Turner
        name: Sean Turner
        org: sn3rd
        role: editor


--- abstract

This document defines the properties of the QUIC transport protocol that are
expected to remain unchanged over time as new versions of the protocol are
developed.


--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/-invariants>.


--- middle

# Introduction

In addition to providing secure, multiplexed transport, QUIC {{QUIC-TRANSPORT}}
includes the ability to negotiate a version.  This allows the protocol to change
over time in response to new requirements.  Many characteristics of the protocol
will change between versions.

This document describes the subset of QUIC that is intended to remain stable as
new versions are developed and deployed.  All of these invariants are
IP-version-independent.

The primary goal of this document is to ensure that it is possible to deploy new
versions of QUIC.  By documenting the properties that can't change, this
document aims to preserve the ability to change any other aspect of the
protocol.  Thus, unless specifically described in this document, any aspect of
the protocol can change between different versions.

{{bad-assumptions}} is a non-exhaustive list of some incorrect assumptions that
might be made based on knowledge of QUIC version 1; these do not apply to every
version of QUIC.


# Conventions and Definitions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in BCP 14 {{!RFC2119}} {{!RFC8174}}
when, and only when, they appear in all capitals, as shown here.


# An Extremely Abstract Description of QUIC

QUIC is a connection-oriented protocol between two endpoints.  Those endpoints
exchange UDP datagrams.  These UDP datagrams contain QUIC packets.  QUIC
endpoints use QUIC packets to establish a QUIC connection, which is shared
protocol state between those endpoints.


# QUIC Packet Headers

A QUIC packet is the content of the UDP datagrams exchanged by QUIC endpoints.
This document describes the contents of those datagrams.

QUIC defines two types of packet header: long and short.  Packets with long
headers are identified by the most significant bit of the first octet being set;
packets with a short header have that bit cleared.

Aside from the values described here, the payload of QUIC packets is
version-specific and of arbitrary length.


## Long Header

Long headers take the form described in {{fig-long}}.  Bits that have
version-specific semantics are marked with an X.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|1|X X X X X X X|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Version (32)                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|DCIL(4)|SCIL(4)|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|               Destination Connection ID (0/32..144)         ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 Source Connection ID (0/32..144)            ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|X X X X X X X X X X X X X X X X X X X X X X X X X X X X X X  ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #fig-long title="QUIC Long Header"}

A QUIC packet with a long header has the high bit of the first octet set to 1.
All other bits in that octet are version specific.

The next four octets include a 32-bit Version field (see {{version}}).

The next octet contains the length in octets of the two Connection IDs (see
{{connection-id}}) that follow.  Each length is encoded as a 4-bit unsigned
integer.  The length of the Destination Connection ID (DCIL) occupies the high
bits of the octet and the length of the Source Connection ID (SCIL) occupying
the low bits of the octet.  An encoded length of 0 indicates that the connection
ID is also 0 octets in length.  Non-zero encoded lengths are increased by 3 to
get the full length of the connection ID; the final value is therefore either 0
or between 4 and 18 octets in length (inclusive).  For example, an octet with
the value 0xe0 describes a 17 octet Destination Connection ID and a zero octet
Source Connection ID.

The connection ID lengths are followed by two connection IDs.  The connection
ID associated with the recipient of the packet (the Destination Connection ID)
is followed by the connection ID associated with the sender of the packet (the
Source Connection ID).

The remainder of the packet contains version-specific content.


## Short Header

Short headers take the form described in {{fig-short}}.  Bits that have
version-specific semantics are marked with an X.

~~~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|0|X X X X X X X|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                Destination Connection ID (0..144)           ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|X X X X X X X X X X X X X X X X X X X X X X X X X X X X X X  ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~
{: #fig-short title="QUIC Short Header"}

A QUIC packet with a short header has the high bit of the first octet set to 0.

A QUIC packet with a short header includes an optional Destination Connection
ID.  The short header does not include the Connection ID Lengths, Source
Connection ID, or Version fields.

The remainder of the packet has version-specific semantics.


## Connection ID

A connection ID is an opaque field.  A connection ID can be 0 octets in length,
or between 4 and 18 octets (inclusive).

The primary function of a connection ID is to ensure that changes in addressing
at lower protocol layers (UDP, IP, and below) don't cause packets for a QUIC
connection to be delivered to the wrong endpoint.  The connection ID is used by
endpoints and the intermediaries that support them to ensure that each QUIC
packet can be delivered to the correct instance of an endpoint.  At the
endpoint, the connection ID is used to identify which QUIC connection the packet
is intended for.

The connection ID is chosen by each endpoint using version-specific methods.
Packets for the same QUIC connection might use different connection ID values.


## Version

QUIC versions are identified with a 32-bit integer, encoded in network byte
order.  Version 0 is reserved for version negotiation (see
{{version-negotiation}}).  All other version numbers are potentially valid.

The properties described in this document apply to all versions of QUIC. A
protocol that does not conform to the properties described in this document is
not QUIC.  Future documents might describe additional properties which apply to
a specific QUIC version, or to a range of QUIC versions.

# Version Negotiation {#version-negotiation}

A QUIC endpoint that receives a packet with a long header and a version it
either does not understand or does not support might send a Version Negotiation
packet in response.  Packets with a short header do not trigger version
negotiation and are always associated with an existing connection.

Consequently, until an endpoint has confirmed that its peer supports the QUIC
version it has chosen, it can only send packets that use the long header.

A Version Negotiation packet sets the high bit of the first octet, and thus it
conforms with the format of a packet with a long header as defined in
{{long-header}}.  A Version Negotiation packet is identifiable as such by the
Version field, which is set to 0x00000000.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|1|X X X X X X X|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Version (32) = 0                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|DCIL(4)|SCIL(4)|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|               Destination Connection ID (0/32..144)         ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 Source Connection ID (0/32..144)            ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Supported Version 1 (32)                   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   [Supported Version 2 (32)]                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                               ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   [Supported Version N (32)]                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #version-negotiation-format title="Version Negotiation Packet"}


The Version Negotiation packet contains a list of Supported Version fields, each
identifying a version that the endpoint sending the packet supports.  The
Supported Version fields follow the Version field.  A Version Negotiation packet
contains no other fields.  An endpoint MUST ignore a packet that contains no
Supported Version fields, or a truncated Supported Version.

Version Negotiation packets do not use integrity or confidentiality protection.
A specific QUIC version might authenticate the packet as part of its connection
establishment process.

The server MUST include the value from the Source Connection ID field of the
packet it receives in the Destination Connection ID field.  The value for Source
Connection ID MUST be copied from the Destination Connection ID of the received
packet, which is initially randomly selected by a client.  Echoing both
connection IDs gives clients some assurance that the server received the packet
and that the Version Negotiation packet was not generated by an off-path
attacker.

An endpoint that receives a Version Negotiation packet might change the version
that it decides to use for subsequent packets.  The conditions under which an
endpoint changes QUIC version will depend on the version of QUIC that it
chooses.

See {{QUIC-TRANSPORT}} for a more thorough description of how an endpoint that
supports QUIC version 1 generates and consumes a Version Negotiation packet.


# Security and Privacy Considerations

It is possible that middleboxes could use traits of a specific version of QUIC
and assume that when other versions of QUIC exhibit similar traits the same
underlying semantic is being expressed.  There are potentially many such traits
(see {{bad-assumptions}}).  Some effort has been made to either eliminate or
obscure some observable traits in QUIC version 1, but many of these remain.
Other QUIC versions might make different design decisions and so exhibit
different traits.

The QUIC version number does not appear in all QUIC packets, which means that
reliably extracting information from a flow based on version-specific traits
requires that middleboxes retain state for every connection ID they see.

The Version Negotiation packet described in this document is not
integrity-protected, it only has modest protection against insertion by off-path
attackers.  QUIC versions MUST define a mechanism that authenticates the values
it contains.


# IANA Considerations

This document makes no request of IANA.


--- back

# Incorrect Assumptions {#bad-assumptions}

There are several traits of QUIC version 1 {{QUIC-TRANSPORT}} that are not
protected from observation, but are nonetheless considered to be changeable when
a new version is deployed.

This section lists a sampling of incorrect assumptions that might be made based
on knowledge of QUIC version 1.  Some of these statements are not even true for
QUIC version 1.  This is not an exhaustive list, it is intended to be
illustrative only.

The following statements are NOT guaranteed to be true for every QUIC version:

* QUIC uses TLS {{QUIC-TLS}} and some TLS messages are visible on the wire

* QUIC long headers are only exchanged during connection establishment

* Every flow on a given 5-tuple will include a connection establishment phase

* QUIC forbids acknowledgments of packets that only contain ACK frames,
  therefore the last packet before a long period of quiescence might be assumed
  to contain an acknowledgment

* QUIC uses an AEAD (AEAD_AES_128_GCM {{?RFC5116}}) to protect the packets it
  exchanges during connection establishment

* QUIC packet numbers appear after the Version field

* QUIC packet numbers increase by one for every packet sent

* QUIC has a minimum size for the first handshake packet sent by a client

* QUIC stipulates that a client speaks first

* A QUIC Version Negotiation packet is only sent by a server

* A QUIC connection ID changes infrequently

* QUIC endpoints change the version they speak if they are sent a Version
  Negotiation packet

* The version field in a QUIC long header is the same in both directions

* Only one connection at a time is established between any pair of QUIC
  endpoints
