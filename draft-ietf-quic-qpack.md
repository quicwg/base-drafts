---
title: "QPACK: Header Compression for HTTP over QUIC"
abbrev: QPACK
docname: draft-ietf-quic-qpack-latest
date: {DATE}
category: std
ipr: trust200902
area: Transport
workgroup: QUIC

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
 -
    ins: C. Krasic
    name: Charles 'Buck' Krasic
    org: Google, Inc
    email: ckrasic@google.com
 -
    ins: M. Bishop
    name: Mike Bishop
    org: Akamai Technologies
    email: mbishop@evequefou.be
 -
    ins: A. Frindell
    name: Alan Frindell
    org: Facebook
    email: afrind@fb.com
    role: editor


--- abstract

This specification defines QPACK, a compression format for efficiently
representing HTTP header fields, to be used in HTTP over QUIC. This is a
variation of HPACK header compression that seeks to reduce head-of-line
blocking.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/-qpack>.

--- middle

# Introduction

The QUIC transport protocol was designed from the outset to support HTTP
semantics, and its design subsumes many of the features of HTTP/2.  QUIC's
stream multiplexing comes into some conflict with  header compression.  A key
goal of the design of QUIC is to improve stream multiplexing relative to HTTP/2
by eliminating HoL (head of line) blocking, which can occur in HTTP/2.  HoL
blocking can happen because all HTTP/2 streams are multiplexed onto a single TCP
connection with its in-order semantics.  QUIC can maintain independence between
streams because it implements core transport functionality in a fully
stream-aware manner.  However, the HTTP/QUIC mapping is still subject to HoL
blocking if HPACK is used directly.  HPACK exploits multiplexing for greater
compression, shrinking the representation of headers that have appeared earlier
on the same connection.  In the context of QUIC, this imposes a vulnerability to
HoL blocking (see {{hol-example}}).

QUIC is described in {{?QUIC-TRANSPORT=I-D.ietf-quic-transport}}.  The HTTP/QUIC
mapping is described in {{!QUIC-HTTP=I-D.ietf-quic-http}}. For a full
description of HTTP/2, see {{?RFC7540}}. The description of HPACK is
{{!RFC7541}}, with important terminology in Section 1.3.

QPACK modifies HPACK to allow correctness in the presence of out-of-order
delivery, with flexibility for implementations to balance between resilience
against HoL blocking and optimal compression ratio.  The design goals are to
closely approach the compression ratio of HPACK with substantially less
head-of-line blocking under the same loss conditions.

QPACK is intended to be a relatively non-intrusive extension to HPACK; an
implementation should be easily shared within stacks supporting both HTTP/2 over
(TLS+)TCP and HTTP/QUIC.

## Head-of-Line Blocking in HPACK {#hol-example}

HPACK enables several types of header representations, one of which also adds
the header to a dynamic table of header values.  These values are then available
for reuse in subsequent header blocks simply by referencing the entry number in
the table.

If the packet containing a header is lost, that stream cannot complete header
processing until the packet is retransmitted.  This is unavoidable. However,
other streams which rely on the state created by that packet *also* cannot make
progress. This is the problem which QUIC solves in general, but which is
reintroduced by HPACK when the loss includes a HEADERS frame.

## Avoiding Head-of-Line Blocking in HTTP/QUIC {#overview-hol-avoidance}

In the example above, the second stream contained a reference to data
which might not yet have been processed by the recipient.  Such references
are called "vulnerable," because the loss of a different packet can keep
the reference from being usable.

The encoder can choose on a per-header-block basis whether to favor higher
compression ratio (by permitting vulnerable references) or HoL resilience (by
avoiding them). This is signaled by the BLOCKING flag in HEADERS and
PUSH_PROMISE frames (see {{QUIC-HTTP}}).

If a header block contains no vulnerable header fields, BLOCKING MUST be 0.
This implies that the header fields are represented either as references
to dynamic table entries which are known to have been received, or as
Literal header fields (see Section 6.2 of {{RFC7541}}).

If a header block contains any header field which references dynamic table
state which the peer might not have received yet, the BLOCKING flag MUST be
set.  If the peer does not yet have the appropriate state, such blocks
might not be processed on arrival.

The header block contains a prefix ({{absolute-index}}). This prefix contains
table offset information that establishes total ordering among all headers,
regardless of reordering in the transport (see {{overview-absolute}}).

In blocking mode, the prefix additionally identifies the minimum state required
to process any vulnerable references in the header block (see `Depends Index` in
{{overview-absolute}}).  The decoder keeps track of which entries have been
added to its dynamic table.  The stream for a header with BLOCKING flag set is
considered blocked by the decoder and can not be processed until all entries in
the range `[1, Depends Index]` have been added.  While blocked, header
field data MUST remain in the blocked stream's flow control window.

# Wire Format

QCRAM instructions occur on three stream types, each of which uses a separate
instruction space:

 - Table updates are carried by HEADERS frames on the control stream, as defined
   by {{QUIC-HTTP}}.  Frames on this stream modify the dynamic table state
   without generating output to any particular request.
 - Acknowledgement of header frame processing is carried by HEADER_ACK frames,
   running from decoder to encoder.
 - Finally, the contents of HEADERS and PUSH_PROMISE frames on request streams
   reference the QPACK table state.

This section describes the instructions which are possible on each stream type.

In order to ensure table consistency, all modifications of the header table
occur on the control stream rather than on request streams. Request streams
contain only indexed and literal header entries.

## HEADERS Frames on the Control Stream

### Insert

An addition to the header table starts with the '1' one-bit pattern. If the
header field name matches the header field name of an entry stored in the static
table or the dynamic table, the header field name can be represented using the
index of that entry. In this case, the `S` bit indicates whether the reference
is to the static (S=1) or dynamic (S=0) table and the index of the entry is
represented as an integer with an 7-bit prefix (see Section 5.1 of [RFC7541]).
This value is always non-zero.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 1 | S |    Name Index (6+)    |
   +---+---+-----------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Insert Header Field -- Indexed Name"}

Otherwise, the header field name is represented as a string literal (see Section
5.2 of [RFC7541]). A value 0 is used in place of the table reference, followed
by the header field name.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 1 |             0             |
   +---+---------------------------+
   | H |     Name Length (7+)      |
   +---+---------------------------+
   |  Name String (Length octets)  |
   +---+---------------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Insert Header Field -- New Name"}

Either form of header field name representation is followed by the header field
value represented as a string literal (see Section 5.2 of [RFC7541]).

### Duplicate {#indexed-duplicate}

An entry currently in the dynamic table can be re-inserted into the dynamic
table without resending the header.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 |         Index (7+)        |
   +---+---------------------------+
~~~~~~~~~~
{:#fig-index-with-duplication title="Duplicate"}

This is useful to mitigate the eviction of older entries which are frequently
referenced, both to avoid the need to resend the header and to avoid the entry
in the table blocking the ability to insert new headers.

## HEADER_ACK Frames

HEADER_ACK frames on the control stream carry information used to ensure
consistency of the dynamic table. Information is sent from the QCRAM decoder to
the QCRAM encoder; that is, the server informs the client about the processing
of the client's header blocks, and the client informs the server about the
processing of the server's header blocks.

Each frame represents a header block which the QCRAM decoder has fully
processed.  It is used by the peer's QCRAM encoder to determine whether
subsequent indexed representations that might reference that block are
vulnerable to head-of-line blocking, and to prevent eviction races.

The frame payload contains contains a variable-length integer (as defined in
{{QUIC-TRANSPORT}}) which indicates the stream on which the header block was
processed. The same Stream ID can be identified multiple times, as multiple
header-containing blocks can be sent on a single stream in the case of
intermediate responses, trailers, pushed requests, etc. as well as on the
Control Streams.  Since header frames on each stream are received and processed
in order, this gives the encoder precise feedback on which header blocks within
a stream have been fully processed.

## Request Streams

HEADERS and PUSH_PROMISE frames on request and push streams reference the
dynamic table in a particular state without modifying it, but emit the headers
for an HTTP request or response.

### Index Encoding {#absolute-index}

Header data is prefixed by an integer: `Base Index`.  `Base index` is the
cumulative number of entries added to the dynamic table prior to encoding the
current block, including any entries already evicted.  It is encoded as a single
8-bit prefix integer:

~~~~~~~~~~  drawing
    0 1 2 3 4 5 6 7
   +-+-+-+-+-+-+-+-+
   |Base Index (8+)|
   +---------------+
~~~~~~~~~~
{:#fig-base-index title="Absolute indexing (BLOCKING=0x0)"}

{{overview-absolute}} describes the role of `Base Index`.

When the BLOCKING flag is 0x1, a the prefix additionally contains a second HPACK
integer (8-bit prefix) 'Depends':

~~~~~~~~~~  drawing
    0 1 2 3 4 5 6 7
   +-+-+-+-+-+-+-+-+
   |Base Index (8+)|
   +---------------+
   |Depends    (8+)|
   +---------------+
~~~~~~~~~~
{:#fig-prefix-long title="Absolute indexing (BLOCKING=0x1)"}

Depends is used to identify header dependencies (see
{{overview-hol-avoidance}}).  The encoder computes a value `Depends Index` which
is the largest (absolute) index referenced by the following header block.  To
help keep the prefix smaller, `Depends Index` is converted to a relative value:
`Depends = Base Index - Depends Index`.

#### Hybrid absolute-relative indexing {#overview-absolute}

HPACK indexed entries refer to an entry by its current position in the dynamic
table.  As Figure 1 of {{!RFC7541}} illustrates, newer entries have smaller
indices, and older entries are evicted first if the table is full.  Under this
scheme, each insertion to the table causes the index of all existing entries to
change (implicitly).  Implicit index updates are acceptable for HTTP/2 because
TCP is totally ordered, but are problematic in the out-of-order context of
QUIC.

QPACK uses a hybrid absolute-relative indexing approach.

When the encoder adds a new entry to its header table, it can compute
an absolute index:

```
entry.absoluteIndex = baseIndex++;
```

Since literals with indexing are only sent on the control stream, the decoder
can be guaranteed to compute the same absolute index values when it adds
corresponding entries to its table, just as in HPACK and HTTP/2.

When encoding indexed representations, the following holds for (relative) HPACK
indices:

`relative index = baseIndex - entry.absoluteIndex + staticTable.size`

Header blocks on request and push streams do not modify the dynamic table state,
so they never change the `baseIndex`.  However, since ordering between streams
is not guaranteed, the value of `baseIndex` can not be synchronized implicitly.
Instead then, QPACK sends encoder's `Base Index` explicitly as part of the
prefix (see {{absolute-index}}), so that the decoder can compute the same
absolute indices that the encoder used:

`absoluteIndex = prefix.baseIndex + staticTable.size - relativeIndex;`

In this way, even if request or push stream headers are decoded in a different
order than encoded, the absolute indices will still identify the correct table
entries.

It is an error if the HPACK decoder encounters an indexed representation that
refers to an entry missing from the table, and the connection MUST be closed
with the `HTTP_HPACK_DECOMPRESSION_FAILED` error code.

### Instructions

#### Indexed Header Field Representation

An indexed header field representation identifies an entry in either the static
table or the dynamic table and causes that header field to be added to the
decoded header list, as described in Section 3.2 of [RFC7541].

~~~~~~~~~~ drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
| 1 | S |      Index (6+)       |
+---+---------------------------+
~~~~~~~~~~
{: title="Indexed Header Field"}

An indexed header field starts with the '1' 1-bit pattern, followed by the `S`
bit indicating whether the reference is into the static (S=1) or dynamic (S=0)
table. Finally, the index of the matching header field is represented as an
integer with a 6-bit prefix (see Section 5.1 of [RFC7541]).

The index value of 0 is not used.  It MUST be treated as a decoding error if
found in an indexed header field representation.

#### Literal Header Field Representation

A literal header field representation starts with the '0' 1-bit pattern and
causes a header field to be added the decoded header list.

The second bit, 'N', indicates whether an intermediary is permitted to add this
header to the dynamic header table on subsequent hops. When the 'N' bit is set,
the encoded header MUST always be encoded with this specific literal
representation. In particular, when a peer sends a header field that it received
represented as a literal header field with the 'N' bit set, it MUST use the same
representation to forward this header field.  This bit is intended for
protecting header field values that are not to be put at risk by compressing
them (see Section 7.1 of [RFC7541] for more details).

If the header field name matches the header field name of an entry stored in the
static table or the dynamic table, the header field name can be represented
using the index of that entry. In this case, the `S` bit indicates whether the
reference is to the static (S=1) or dynamic (S=0) table and the index of the
entry is represented as an integer with an 5-bit prefix (see Section 5.1 of
[RFC7541]). This value is always non-zero.

~~~~~~~~~~
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | N | S |  Name Index (5+)  |
   +---+---+-----------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Literal Header Field -- Indexed Name"}

Otherwise, the header field name is represented as a string literal (see Section
5.2 of [RFC7541]). A value 0 is used in place of the 6-bit index, followed by
the header field name.

~~~~~~~~~~
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | N |           0           |
   +---+---+-----------------------+
   | H |     Name Length (7+)      |
   +---+---------------------------+
   |  Name String (Length octets)  |
   +---+---------------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Literal Header Field -- Literal Name"}

Either form of header field name representation is followed by the header field
value represented as a string literal (see Section 5.2 of [RFC7541]).


# Encoding Strategies

Due to out-of-order arrival, QPACK's eviction algorithm requires changes
(relative to HPACK) to avoid the possibility that an indexed representation is
decoded after the referenced entry has already been evicted.  QPACK employs a
two-phase eviction algorithm, in which the encoder will not evict entries that
have outstanding (unacknowledged) references.

## Reference Tracking

An encoder MUST ensure that an indexed representation is not received by the
encoder after the referenced entry has already been evicted, and might wish to
ensure that the decoder will not suffer head-of-line blocking when encoding
particular references.

In order to enable this, the encoder MUST track outstanding (unacknowledged)
header blocks on request streams and MAY track outstanding header blocks on the
control stream.

When the encoder receives feedback from the decoder, it dereferences table
entries that were indexed in the acknowledged header.  To track which entries
must be dereferenced, it can maintain a map from unacknowledged headers to lists
of (absolute) indices.  The simplest place to store the actual reference count
might be the table entries.  In practice the number of entries in the table with
a non-zero reference count is likely to stay quite small.  A data structure
tracking only entries with non-zero reference counts, separate from the main
header table, could be more space efficient.


### Blocked Eviction

The encoder MUST NOT permit an entry to be evicted while a reference to that
entry remains unacknowledged.  If a new header to be inserted into the dynamic
table would cause the eviction of such an entry, the encoder MUST NOT emit the
insert instruction until the reference has been processed by the decoder and
acknowledged.

The encoder can emit a literal representation for the new header in order to
avoid encoding delays, and MAY insert the header into the table later if
desired.

To ensure that the blocked eviction case is rare, references to the oldest
entries in the dynamic table SHOULD be avoided.  When one of the oldest entries
in the table is still actively used for references, the encoder SHOULD emit an
Indexed-Duplicate representation instead (see {{indexed-duplicate}}).

## Blocked Decoding

For header blocks encoded in non-blocking mode, the encoder needs to forego
indexed representations that refer to vulnerable entries (see
{{overview-hol-avoidance}}).  An implementation could extend the header table
entry with a boolean to track vulnerability.  However, the number of entries in
the table that are vulnerable is likely to be small in practice, much less than
the total number of entries, so a data tracking only vulnerable
(un-acknowledged) entries, separate from the main header table, might be more
space efficient.

To track blocked streams, an ordered map (e.g. multi-map) from `Depends Index`
values to streams can be used.  Whenever the decoder processes a header block on
the control stream, it can drain any members of the blocked streams map that now
have their dependencies satisfied.

## Speculative table updates {#speculative-updates}

Implementations can *speculatively* send header frames on the HTTP Control
Streams which are not needed for any current HTTP request or response.  Such
headers could be used strategically to improve performance.  For instance, the
encoder might decide to *refresh* by sending Indexed-Duplicate representations
for popular header fields ({{absolute-index}}), ensuring they have small indices
and hence minimal size on the wire.

# Security Considerations

TBD.

# IANA Considerations

This document registers a new frame type, HEADER_ACK, for HTTP/QUIC. This will
need to be added to the IANA Considerations of {{QUIC-HTTP}}.

--- back

# Acknowledgments
{:numbered="false"}

This draft draws heavily on the text of {{!RFC7541}}.  The indirect input of
those authors is gratefully acknowledged, as well as ideas from:

* Ryan Hamilton

* Patrick McManus

* Kazuho Oku

* Biren Roy

* Ian Swett

* Dmitri Tikhonov
