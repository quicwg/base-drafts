---
title: Header Compression for HTTP over QUIC
abbrev: QCRAM
docname: draft-ietf-quic-qcram-latest
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

This specification defines QCRAM, a compression format for efficiently
representing HTTP header fields, to be used in HTTP over QUIC. This is a
variation of HPACK header compression that seeks to reduce head-of-line
blocking.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/-qcram>.

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

QCRAM modifies HPACK to allow correctness in the presence of out-of-order
delivery, with flexibility for implementations to balance between resilience
against HoL blocking and optimal compression ratio.  The design goals are to
closely approach the compression ratio of HPACK with substantially less
head-of-line blocking under the same loss conditions.

QCRAM is intended to be a relatively non-intrusive extension to HPACK; an
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

In order to ensure table consistency and simplify update management, all table
updates occur on the control stream rather than on request streams. Request
streams contain only header blocks, which do not modify the state of the table.

## Primitives

The prefixed integer from Section 5.1 of [RFC7541] is used heavily throughout
this document.  The string literal, defined by Section 5.2 of [RFC7541], is used
with the following modification.

HPACK defines string literals to begin on a byte boundary.  They begin with a
single flag (indicating whether the string is Huffman-coded), followed by the
Length encoded as a 7-bit prefix integer, and finally Length octets of data.

QCRAM permits strings to begin other than on a byte boundary.  An "N-bit prefix
string literal" begins with the same Huffman flag, followed by the length
encoded as an (N-1)-bit prefix integer.  The remainder of the string literal is
unmodified.

A string literal without a prefix length noted is an 8-bit prefix string literal
and follows the definitions in [RFC7541] without modification.

## HEADERS Frames on the Control Stream

Table updates can add a table entry, possibly using existing entries to avoid
transmitting redundant information.  The name can be transmitted as a reference
to an existing entry in either table or as a string literal. For entries which
already exist in the dynamic table, the full entry can also be used by
reference, creating a duplicate entry.

### Insert With Name Reference

An addition to the header table where the header field name matches the header
field name of an entry stored in the static table or the dynamic table starts
with the '1' one-bit pattern.  The `S` bit indicates whether the reference is to
the static (S=1) or dynamic (S=0) table. The header field name is represented
using the index of that entry, which is represented as an integer with a 6-bit
prefix (see Section 5.1 of [RFC7541]). Table indices are always non-zero; a zero
index MUST be treated as a decoding error.

The header name reference is followed by the header field value represented as a
string literal (see Section 5.2 of [RFC7541]).

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


### Insert Without Name Reference

An addition to the header table where both the header field name and the header
field value are represented as string literals (see {{primitives}}) starts with
the '01' two-bit pattern.

The name is represented as a 6-bit prefix string literal, while the value is
represented as an 8-bit prefix string literal.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | 1 | H | Name Length (5+)  |
   +---+---+---+-------------------+
   |  Name String (Length octets)  |
   +---+---------------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Insert Header Field -- New Name"}


### Duplicate {#indexed-duplicate}

Duplication of an existing entry in the dynamic table starts with the '000'
three-bit pattern.  The index of the existing entry is represented as an integer
with a 5-bit prefix. Table indices are always non-zero; a table index of zero
MUST be treated as a decoding error.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | 0 | 0 |    Index (5+)     |
   +---+---------------------------+
~~~~~~~~~~
{:#fig-index-with-duplication title="Duplicate"}

The existing entry is re-inserted into the dynamic table without resending
either the name or the value. This is useful to mitigate the eviction of older
entries which are frequently referenced, both to avoid the need to resend the
header and to avoid the entry in the table blocking the ability to insert new
headers.

### Dynamic Table Size Update

A dynamic table size update signals a change to the size of the dynamic table.

~~~~~~~~~~ drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
| 0 | 0 | 1 |   Max size (5+)   |
+---+---------------------------+
~~~~~~~~~~
{:#fig-size-change title="Maximum Dynamic Table Size Change"}

A dynamic table size update starts with the '001' 3-bit pattern, followed by the
new maximum size, represented as an integer with a 5-bit prefix (see Section
5.1 of [RFC7541]).

The new maximum size MUST be lower than or equal to the limit determined by the
protocol using QCRAM.  A value that exceeds this limit MUST be treated as a
decoding error.  In HTTP/QUIC, this limit is the value of the
SETTINGS_HEADER_TABLE_SIZE parameter (see [QUIC-HTTP]) received from the
decoder.

Reducing the maximum size of the dynamic table can cause entries to
be evicted (see Section 4.3 of [RFC7541]).

## HEADER_ACK Frames {#feedback}

HEADER_ACK frames on the control stream carry information used to ensure
consistency of the dynamic table. Information is sent from the QCRAM decoder to
the QCRAM encoder; that is, the server informs the client about the processing
of the client's header blocks and table updates, and the client informs the
server about the processing of the server's header blocks and table updates.

Each frame represents a header block or table update which the QCRAM decoder has
fully processed.  It is used by the peer's QCRAM encoder to determine whether
subsequent indexed representations that might reference impacted entries are
vulnerable to head-of-line blocking, and to prevent eviction races.

The frame payload contains contains a variable-length integer (as defined in
{{QUIC-TRANSPORT}}) which indicates the stream on which the header block was
processed. The same Stream ID can be identified in multiple frames, as multiple
header blocks can be sent on a single request or push stream.  (Requests can
have trailers; responses can have intermediate status codes and PUSH_PROMISE
frames.) As the control stream carries multiple table updates, the control
stream can also be identified in multiple frames.

Since header frames on each stream are received and processed in
order, this gives the encoder precise feedback on which header blocks within a
stream have been fully processed.

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

### Hybrid absolute-relative indexing {#overview-absolute}

HPACK indexed entries refer to an entry by its current position in the dynamic
table.  As Figure 1 of {{!RFC7541}} illustrates, newer entries have smaller
indices, and older entries are evicted first if the table is full.  Under this
scheme, each insertion to the table causes the index of all existing entries to
change (implicitly).  Implicit index updates are acceptable for HTTP/2 because
TCP is totally ordered, but are problematic in the out-of-order context of
QUIC.

QCRAM uses a hybrid absolute-relative indexing approach.

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
Instead then, QCRAM sends encoder's `Base Index` explicitly as part of the
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
+---+---+-----------------------+
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
[RFC7541]). Valid table indices are always non-zero; a table index of zero
MUST be treated as a decoding error.

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

## Reference Tracking

An encoder MUST ensure that a header block which references a dynamic table
entry is not received by the decoder after the referenced entry has already been
evicted, and might wish to ensure that the decoder will not suffer head-of-line
blocking when encoding particular references.

In order to enable this, the encoder MUST track outstanding (unacknowledged)
header blocks and MAY track outstanding table updates.

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
indexed representations that refer to table updates which have not yet been
acknowledged with {{feedback}}.  An implementation could extend the header table
entry with a boolean to track acknowledgement state.  However, the number of
entries in the table that are unacknowledged is likely to be small in practice,
much less than the total number of entries, so tracking only un-acknowledged
entries separate from the main header table might be more space efficient.

To track blocked streams, the necessary `Depends Index` values for each stream
can be used.  Whenever the decoder processes a table update, it can begin
decoding any blocked streams that now have their dependencies satisfied.

## Speculative table updates {#speculative-updates}

Implementations can *speculatively* send header frames on the HTTP Control
Streams which are not needed for any current HTTP request or response.  Such
headers could be used strategically to improve performance.  For instance, the
encoder might decide to *refresh* by sending Indexed-Duplicate representations
for popular header fields ({{absolute-index}}), ensuring they have small indices
and hence minimal size on the wire.



### Fixed overhead.

HPACK defines overhead as 32 bytes ({{!RFC7541}}, Section 4.1).  As described
above, QCRAM adds some per-connection state, and possibly some per-entry state
to track acknowledgment status and eviction reference count.  A larger value
than 32 might be more accurate for QCRAM.

# Security Considerations

TBD.

# IANA Considerations

None.

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
