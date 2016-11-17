---
title: HTTP/2 Semantics Using The QUIC Transport Protocol
abbrev: HTTP/2 Over QUIC
docname: draft-ietf-quic-http-mapping-latest
date: 2016
category: std
ipr: trust200902

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
 -
    ins: R. Shade
    name: Robbie Shade
    org: Google
    email: rjshade@google.com
 -
    ins: M. Warres
    name: Mike Warres
    org: Google
    email: mpw@google.com

normative:

informative:


--- abstract

The QUIC transport protocol has several features that are desirable in a
transport for HTTP/2, such as stream multiplexing, per-stream flow control, and
low-latency connection establishment.  This document describes a mapping of
HTTP/2 semantics over QUIC.  Specifically, this document identifies HTTP/2
features that are subsumed by QUIC, and describes how the other features can be
implemented atop QUIC.


--- middle


# Introduction

The QUIC transport protocol has several features that are desirable in a
transport for HTTP/2, such as stream multiplexing, per-stream flow control, and
low-latency connection establishment.  This document describes a mapping of
HTTP/2 semantics over QUIC.  Specifically, this document identifies HTTP/2
features that are subsumed by QUIC, and describes how the other features can be
implemented atop QUIC.

QUIC is described in {{!I-D.ietf-quic-transport-protocol}}.  For a full
description of HTTP/2, see {{!RFC7540}}.


## Notational Conventions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.


# QUIC advertisement

A server advertises that it can speak HTTP/2-over-QUIC via the Alt- Svc HTTP
response header.  It does so by including the header in any response sent over a
non-QUIC (e.g.  HTTP/2 over TLS) connection:

   Alt-Svc: quic=":443"

In addition, the list of QUIC versions supported by the server can be specified
by the v= parameter.  For example, if a server supported both version 33 and 34
it would specify the following header:

   Alt-Svc: quic=":443"; v="34,33"

On receipt of this header, a client may attempt to establish a QUIC connection
on port 443 and, if successful, send HTTP/2 requests using the mapping described
in this document.

Connectivity problems (e.g. firewall blocking UDP) may result in QUIC connection
establishment failure, in which case the client should gracefully fallback to
HTTP/2-over-TLS/TCP.


# Connection establishment

HTTP/2-over-QUIC connections are established as described in
{{!I-D.ietf-quic-transport-protocol}}.  The QUIC crypto handshake MUST use TLS
{{!I-D.ietf-quic-tls}}.

While connection-level options pertaining to the core QUIC protocol are set in
the initial crypto handshake [Combined Crypto and Transport Handshake],
HTTP/2-specific settings are conveyed in the HTTP/2 SETTINGS frame.  After the
QUIC connection is established, an HTTP/2 SETTINGS frame may be sent as the
initial frame of the QUIC headers stream (StreamID 3, See {{stream-mapping}}).
As in HTTP/2, additional SETTINGS frames may be sent mid-connection by either
endpoint.

TODO:
: decide whether to acknowledge receipt of SETTINGS through empty SETTINGS
  frames with ACK bit set, as in HTTP/2, or rely on transport- level
  acknowledgment.

Some transport-level options that HTTP/2-over-TCP specifies via the SETTINGS
frame are superseded by QUIC transport parameters in HTTP/2- over-QUIC.  Below
is a listing of how each HTTP/2 SETTINGS parameter is mapped:

SETTINGS_HEADER_TABLE_SIZE:

: Sent in HTTP/2 SETTINGS frame.

SETTINGS_ENABLE_PUSH:

: Sent in HTTP/2 SETTINGS frame (TBD, currently set using QUIC "SPSH" connection
  option)

SETTINGS_MAX_CONCURRENT_STREAMS

: QUIC requires the maximum number of incoming streams per connection to be
  specified in the initial crypto handshake, using the "MSPC" tag.  Specifying
  SETTINGS_MAX_CONCURRENT_STREAMS in the HTTP/2 SETTINGS frame is an error.

SETTINGS_INITIAL_WINDOW_SIZE:

: QUIC requires both stream and connection flow control window sizes to be
  specified in the initial crypto handshake, using the "SFCW" and "CFCW" tags,
  respectively.  Specifying SETTINGS_INITIAL_WINDOW_SIZE in the HTTP/2 SETTINGS
  frame is an error.

SETTINGS_MAX_FRAME_SIZE:

: This setting has no equivalent in QUIC.  Specifying it in the HTTP/2 SETTINGS
  frame is an error.

SETTINGS_MAX_HEADER_LIST_SIZE

: Sent in HTTP/2 SETTINGS frame.

As with HTTP/2-over-TCP, unknown SETTINGS parameters are tolerated but ignored.
SETTINGS parameters are acknowledged by the receiving peer, by sending an empty
SETTINGS frame in response with the ACK bit set.


# Security Considerations



# IANA Considerations

This document has no IANA actions.  Yet.


--- back

# Acknowledgments

Christian Huitema's knowledge of QUIC is far better than my own.  This would be
even more inaccurate and useless if not for his assistance.  This document has
variously benefited from a long series of discussions with Jana Iyengar, Adam
Langley, Roberto Peon, Eric Rescorla, Ian Swett, and likely many others who are
merely forgotten by a faulty meat computer.
