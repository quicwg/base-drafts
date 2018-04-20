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
stream multiplexing comes into some conflict with header compression.  A key
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
avoiding them).

QPACK header blocks contains a prefix ({{absolute-index}}) that specifies the
minimum state of the decoder required to process the block. If the decoder does
not yet have the required state, it must defer processing until it reaches the
required state.  While blocked, the portion of the header block data after the
prefix MUST remain in the blocked stream's flow control window.  Conversely, a
header block that contains no vulnerable headers may be processed by the decoder
immediately upon receipt.


# HPACK extensions

## Allowed Instructions

HEADERS frames on the Control Stream SHOULD contain only Literal with
Incremental Indexing and Indexed with Duplication (see {{indexed-duplicate}})
representations.  Frames on this stream modify the dynamic table state
without generating output to any particular request.

HEADERS and PUSH_PROMISE frames on request and push streams MUST NOT contain
Literal with Incremental Indexing and Indexed with Duplication representations.
Frames on these streams reference the dynamic table in a particular state
without modifying it, but emit the headers for an HTTP request or response.

## Header Block Prefix {#absolute-index}

Header block data in HEADERS and PUSH_PROMISE frames begin with a prefix.  The
prefix contains two logical values: `Largest Reference` and `Base Index`.
`Largest Reference` is the largest absolute dynamic index referenced in the
block.  Blocking decoders use the Largest Reference to determine when it is safe
to process the rest of the block.  `Base Index` is the cumulative number of
entries added to the dynamic table prior to encoding the current block,
including any entries already evicted.  To save space, Base Index is encoded
relative to Largest Reference using a one-bit sign flag.

`baseDelta = largestReference - baseIndex`

If the encoder inserted entries to the table while the encoding the block,
baseDelta will be positive, and is encoded with S=1.  If the block did not
reference the most recent entry in the table and did not insert any new entries,
baseDelta will be negative and is encoded with S=0.  baseDelta of 0 is encoded
with S=1.

~~~~~~~~~~  drawing
    0 1 2 3 4 5 6 7
   +-+-+-+-+-+-+-+-+
   |Largest Ref(8+)|
   +-+-+-+-+-+-+-+-+
   |S|BaseDelta(7+)|
   +---------------+
~~~~~~~~~~
{:#fig-base-index title="Header Block Prefix"}

{{overview-absolute}} describes the role of `Base Index`.

## Hybrid absolute-relative indexing {#overview-absolute}

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

It is an error if the decoder encounters an indexed representation that
refers to an entry missing from the table, and the connection MUST be closed
with the `HTTP_HPACK_DECOMPRESSION_FAILED` error code.

## Single pass encoding

An encoder making a single pass over a list of headers must choose Base Index
before knowing Largest Reference.  An exception occurs when trying to reference
a header inserted to the table after encoding has begun.  In this case,
`relativeIndex = baseIndex - entry.absoluteIndex + staticTable.size` would
either appear to be a static table reference, or a negative number that cannot
be encoded using HPACK integer representation.  Instead, the index is encoded as
`aboveBaseIndex = entry.absoluteIndex - baseIndex + staticTable.size`, and is
used with different instructions that tell the decoder to use a different
mechanism to calculate an entry's absolute index.

### Literal with Above Base Name Index

Literal with Above Base Name Index reuses the Literal with Incremental
Indexing instruction, and is represented as follows:

~~~~~~~~~~  drawing
    0 1 2 3 4 5 6 7
   +-+-+-+-+-+-+-+-+
   |0|1| Index (6+)|
   +---------------+
   |H|Value Len(8+)|
   +---------------+
   |Value (*)      |
   +---------------+
~~~~~~~~~~

### Indexed Header Field with Above Base Index

Indexed Header Field with Above Base Index reuses the Table Size Update
instruction, and is represented as follows:

~~~~~~~~~~  drawing
    0 1 2 3 4 5 6 7
   +-+-+-+-+-+-+-+-+
   |0|0|1|Index(5+)|
   +---------------+
~~~~~~~~~~


## Preventing Eviction Races {#evictions}

Due to out-of-order arrival, QPACK's eviction algorithm requires changes
(relative to HPACK) to avoid the possibility that an indexed representation is
decoded after the referenced entry has already been evicted.  QPACK employs a
two-phase eviction algorithm, in which the encoder will not evict entries that
have outstanding (unacknowledged) references.

### Blocked Evictions

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

## Refreshing Entries with Duplication {#indexed-duplicate}

~~~~~~~~~~  drawing
    0 1 2 3 4 5 6 7
   +-+-+-+-+-+-+-+-+
   |0|0|1|Index(5+)|
   +-+-+-+---------+
~~~~~~~~~~
{:#fig-index-with-duplication title="Indexed Header Field with Duplication"}

*Indexed-Duplicates* insert a new entry into the dynamic table which duplicates
an existing entry. {{RFC7541}} allows duplicate HPACK table entries, that is
entries that have the same name and value.

This replaces the HPACK instruction for Dynamic Table Size Update (see Section
6.3 of {{RFC7541}}, which is not supported by HTTP over QUIC.

# Performance considerations

## Speculative table updates {#speculative-updates}

Implementations can *speculatively* send header frames on the HTTP Control
Streams which are not needed for any current HTTP request or response.  Such
headers could be used strategically to improve performance.  For instance, the
encoder might decide to *refresh* by sending Indexed-Duplicate representations
for popular header fields ({{absolute-index}}), ensuring they have small indices
and hence minimal size on the wire.

## Additional state beyond HPACK

### Vulnerable Entries

For header blocks encoded in non-blocking mode, the encoder needs to forego
indexed representations that refer to vulnerable entries (see
{{overview-hol-avoidance}}).  An implementation could extend the header table
entry with a boolean to track vulnerability.  However, the number of entries in
the table that are vulnerable is likely to be small in practice, much less than
the total number of entries, so a data tracking only vulnerable
(un-acknowledged) entries, separate from the main header table, might be more
space efficient.

### Safe evictions

Section {{evictions}} describes how QPACK avoids invalid references that might
result from out-of-order delivery.  One possible mechanism for tracking this is
as follows: while encoding a block, the encoder maintains a reference set,
which is the set of absolute indexes of dynamic entries that are referenced at
least once in the block.  Each time a new entry is added to the reference set,
its reference count is incremented.  When encoding is complete, the reference
set is appended to a queue associated with the stream.  When a HEADER_ACK for a
stream is received, the encoder dequeues the first reference set from the
stream's queue and decrements the associated reference counts.  If a stream is
reset, the encoder processes all queued reference sets for that stream as if all
header blocks had been acknowledged.

### Decoder Blocking

To support blocking, the decoder needs to keep track of entries it has added to
the dynamic table (see {{overview-hol-avoidance}}), and it needs to track
blocked streams.

Tracking added entries might be done in a brute force fashion without additional
space.  However, this would have O(N) cost where N is the number of entries in
the dynamic table.  Alternatively, a dedicated data structure might improve on
brute force in exchange a small amount of additional space.  For example, a set
of pairs (of indices), representing non-overlapping sub-ranges can be used.
Each operation (add, or query) can be done within O(log M) complexity.  Here set
size M is the number of sub-ranges. In practice M would be very small, as most
table entries would be concentrated in the first sub-range `[1,M]`.

To track blocked streams, an ordered map (e.g. multi-map) from `Depends Index`
values to streams can be used.  Whenever the decoder processes a header block,
it can drain any members of the blocked streams map that have `Depends
Index <= M` where `[1,M]` is the first member of the added- entries sub-ranges
set.  Again, the complexity of operations would be at most O(log N), N being
the number of concurrently blocked streams.

## Sample One Pass Encoding Algorithm

Pseudo-code for single pass encoding, excluding handling of duplicates,
non-blocking mode, and reference tracking.

~~~
baseIndex = dynamicTable.baseIndex
largestReference = 0
for header in headers:
  staticIdx = staticTable.getIndex(header)
  if staticIdx:
    encodeIndexReference(streamBuffer, staticIdx)
    continue

  dynamicIdx = dynamicTable.getIndex(header)
  if !dynamicIdx:
    # No matching entry.  Either insert+index or encode literal
    nameIdx = getNameIndex(header)
    if shouldIndex(header) and dynamicTable.canIndex(header):
      encodeLiteralWithIncrementalIndex(controlBuffer, nameIdx,
                                        header)
      dynamicTable.add(header)
      dynamicIdx = dynamicTable.baseIndex

  if !dynamicIdx:
    # Couldn't index it, literal
    if nameIdx <= staticTable.size:
      encodeLiteral(streamBuffer, nameIndex, header)
    else:
      # encode literal, possibly with nameIdx above baseIndex
      encodeDynamicLiteral(streamBuffer, nameIndex, baseIndex,
                           header)
      largestReference = max(largestReference,
                             dynamicTable.toAbsolute(nameIdx))
  else:
    # Dynamic index reference
    assert(dynamicIdx)
    largestReference = max(largestReference, dynamicIdx)
    # Encode dynamicIdx, possibly with dynamicIdx above baseIndex
    encodeDynamicIndexReference(streamBuffer, dynamicIdx,
                                baseIndex)

# encode the prefix
encodeInteger(prefixBuffer, 0x00, largestReference, 8)
delta = largestReference - baseIndex
sign = delta > 0 ? 0x80 : 0
encodeInteger(prefixBuffer, sign, delta, 7)

return controlBuffer, prefixBuffer + streamBuffer
~~~

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
