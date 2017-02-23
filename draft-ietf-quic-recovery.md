---
title: QUIC Loss Detection and Congestion Control
abbrev: QUIC Loss Detection
docname: draft-ietf-quic-recovery-latest
date: {DATE}
category: std
ipr: trust200902
area: Transport
workgroup: QUIC

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
 -
    ins: J. Iyengar
    name: Jana Iyengar
    org: Google
    email: jri@google.com
    role: editor
 -
    ins: I. Swett
    name: Ian Swett
    org: Google
    email: ianswett@google.com
    role: editor

normative:

  QUIC-TLS:
    title: "Using Transport Layer Security (TLS) to Secure QUIC"
    date: {DATE}
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

  QUIC-TRANSPORT:
    title: "QUIC: A UDP-Based Multiplexed and Secure Transport"
    date: {DATE}
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

  RFC3782:
  RFC6582:
  RFC5827:
  RFC5682:
  RFC6937:
  I-D.dukkipati-tcpm-tcp-loss-probe:

--- abstract

QUIC is a new multiplexed and secure transport atop UDP.  QUIC builds on decades
of transport and security experience, and implements mechanisms that make it
attractive as a modern general-purpose transport.  QUIC implements the spirit of
known TCP loss detection mechanisms, described in RFCs, various Internet-drafts,
and also those prevalent in the Linux TCP implementation.  This document
describes QUIC loss detection and congestion control, and attributes the TCP
equivalent in RFCs, Internet-drafts, academic papers, and TCP implementations.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/recovery>.

--- middle

# Introduction

QUIC is a new multiplexed and secure transport atop UDP.  QUIC builds on decades
of transport and security experience, and implements mechanisms that make it
attractive as a modern general-purpose transport.  The QUIC protocol is
described in {{QUIC-TRANSPORT}}.

QUIC implements the spirit of known TCP loss recovery mechanisms, described in
RFCs, various Internet-drafts, and also those prevalent in the Linux TCP
implementation.  This document describes QUIC congestion control and loss
recovery, and where applicable, attributes the TCP equivalent in RFCs,
Internet-drafts, academic papers, and/or TCP implementations.

This document first describes pre-requisite parts of the QUIC transmission
machinery, then discusses QUIC's default congestion control and loss detection
mechanisms, and finally lists the various TCP mechanisms that QUIC loss
detection implements (in spirit.)


## Notational Conventions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.


# Design of the QUIC Transmission Machinery

All transmissions in QUIC are sent with a packet-level header, which includes a
packet sequence number (referred to below as a packet number).  These packet
numbers never repeat in the lifetime of a connection, and are monotonically
increasing, which makes duplicate detection trivial.  This fundamental design
decision obviates the need for disambiguating between transmissions and
retransmissions and eliminates significant complexity from QUIC's interpretation
of TCP loss detection mechanisms.

Every packet may contain several frames.  We outline the frames that are
important to the loss detection and congestion control machinery below.

* Retransmittable frames are frames requiring reliable delivery.  The most
  common are STREAM frames, which typically contain application data.

* Crypto handshake data is also sent as STREAM data, and uses the reliability
  machinery of QUIC underneath.

* ACK frames contain acknowledgment information.  QUIC uses a SACK-based
  scheme, where acks express up to 256 ranges.  The ACK frame also includes a
  receive timestamp for each packet newly acked.

## Relevant Differences Between QUIC and TCP

There are some notable differences between QUIC and TCP which are important for
reasoning about the differences between the loss recovery mechanisms employed by
the two protocols.  We briefly describe these differences below.

### Monotonically Increasing Packet Numbers

TCP conflates transmission sequence number at the sender with delivery sequence
number at the receiver, which results in retransmissions of the same data
carrying the same sequence number, and consequently to problems caused by
"retransmission ambiguity".  QUIC separates the two: QUIC uses a packet sequence
number (referred to as the "packet number") for transmissions, and any data that
is to be delivered to the receiving application(s) is sent in one or more
streams, with stream offsets encoded within STREAM frames inside of packets that
determine delivery order.

QUIC's packet number is strictly increasing, and directly encodes transmission
order.  A higher QUIC packet number signifies that the packet was sent later,
and a lower QUIC packet number signifies that the packet was sent earlier.  When
a packet containing frames is deemed lost, QUIC rebundles necessary frames in a
new packet with a new packet number, removing ambiguity about which packet is
acknowledged when an ACK is received.  Consequently, more accurate RTT
measurements can be made, spurious retransmissions are trivially detected, and
mechanisms such as Fast Retransmit can be applied universally, based only on
packet number.

This design point significantly simplifies loss detection mechanisms for QUIC.
Most TCP mechanisms implicitly attempt to infer transmission ordering based on
TCP sequence numbers - a non-trivial task, especially when TCP timestamps are
not available.

### No Reneging

QUIC ACKs contain information that is equivalent to TCP SACK, but QUIC does not
allow any acked packet to be reneged, greatly simplifying implementations on
both sides and reducing memory pressure on the sender.

### More ACK Ranges

QUIC supports up to 256 ACK ranges, opposed to TCP's 3 SACK ranges.  In high
loss environments, this speeds recovery.

### Explicit Correction For Delayed Acks

QUIC ACKs explicitly encode the delay incurred at the receiver between when a
packet is received and when the corresponding ACK is sent.  This allows the
receiver of the ACK to adjust for receiver delays, specifically the delayed ack
timer, when estimating the path RTT.  This mechanism also allows a receiver to
measure and report the delay from when a packet was received by the OS kernel,
which is useful in receivers which may incur delays such as context-switch
latency before a userspace QUIC receiver processes a received packet.

# Loss Detection

We now describe QUIC's loss detection as functions that should be called on
packet transmission, when a packet is acked, and timer expiration events.

## Constants of interest

Constants used in loss recovery and congestion control are based on a
combination of RFCs, papers, and common practice.  Some may need to be changed
or negotiated in order to better suit a variety of environments.

kMaxTLPs (default 2):
: Maximum number of tail loss probes before an RTO fires.

kReorderingThreshold (default 3):
: Maximum reordering in packet number space before FACK style loss detection
  considers a packet lost.

kTimeReorderingThreshold (default 1/8):
: Maximum reordering in time sapce before time based loss detection considers
  a packet lost.  In fraction of an RTT.

kMinTLPTimeout (default 10ms):
: Minimum time in the future a tail loss probe alarm may be set for.

kMinRTOTimeout (default 200ms):
:  Minimum time in the future an RTO alarm may be set for.

kDelayedAckTimeout (default 25ms):
: The length of the peer's delayed ack timer.

kDefaultInitialRtt (default 200ms):
: The default RTT used before an RTT sample is taken.

## Variables of interest

We first describe the variables required to implement the loss detection
mechanisms described in this section.

loss_detection_alarm:
: Multi-modal alarm used for loss detection.

alarm_mode:
: QUIC maintains a single loss detection alarm, which switches
  between various modes.  This mode is used to determine the duration of the
  alarm.

handshake_count:
: The number of times the handshake packets have been
  retransmitted without receiving an ack.

tlp_count:
: The number of times a tail loss probe has been sent without
  receiving an ack.

rto_count:
: The number of times an rto has been sent without receiving an ack.

smoothed_rtt:
: The smoothed RTT of the connection, computed as described in
  {{?RFC6298}}

rttvar:
: The RTT variance, computed as described in {{?RFC6298}}

initial_rtt:
: The initial RTT used before any RTT measurements have been made.

reordering_threshold:
: The largest delta between the largest acked
  retransmittable packet and a packet containing retransmittable frames before
  it's declared lost.

use_time_loss:
: When true, loss detection operates solely based on reordering
  threshold in time, rather than in packet number gaps.

sent_packets:
: An association of packet numbers to information about them.

## Initialization

At the beginning of the connection, initialize the loss detection variables as
follows:

~~~
   loss_detection_alarm.reset()
   handshake_count = 0
   tlp_count = 0
   rto_count = 0
   reordering_threshold = kReorderingThreshold
   use_time_loss = false
   smoothed_rtt = 0
   rttvar = 0
   initial_rtt = kDefaultInitialRtt
~~~

## Setting the Loss Detection Alarm

QUIC loss detection uses a single alarm for all timer-based loss detection.  The
duration of the alarm is based on the alarm's mode, which is set in the packet
and timer events further below.  The function SetLossDetectionAlarm defined
below shows how the single timer is set based on the alarm mode.

Pseudocode for SetLossDetectionAlarm follows:

~~~
 SetLossDetectionAlarm():
    if (retransmittable packets are not outstanding):
      loss_detection_alarm.cancel()
      return

    if (handshake packets are outstanding):
      // Handshake retransmission alarm.
      alarm_duration = max(1.5 * smoothed_rtt, kMinTLPTimeout)
                         << handshake_count
      handshake_count++;
    else if (largest sent packet is acked):
      // Early retransmit {{!RFC 5827}}
      // with an alarm to reduce spurious retransmits.
      alarm_duration = 0.25 * smoothed_rtt
    else if (tlp_count < kMaxTLPs):
      // Tail Loss Probe alarm.
      if (retransmittable_packets_outstanding = 1):
        alarm_duration = max(
                           1.5 * smoothed_rtt + kDelayedAckTimeout,
                           2 * smoothed_rtt)
      else:
        alarm_duration = max (kMinTLPTimeout, 2 * smoothed_rtt)
      tlp_count++;
    else:
      // RTO alarm.
      if (rto_count = 0):
        alarm_duration = max(kMinRTOTimeout,
                             smoothed_rtt + 4 * rttvar)
      else:
        alarm_duration = loss_detection_alarm.get_delay() << 1
      rto_count++

    loss_detection_alarm.set(now + alarm_duration)
~~~

## On Sending a Packet

After any packet is sent, be it a new transmission or a rebundled transmission,
the following OnPacketSent function is called.  The parameters to OnPacketSent
are as follows:

* packet_number: The packet number of the sent packet.

* is_retransmittble: A boolean that indicates whether the packet contains at
  least one frame requiring reliable deliver.  The retransmittability of various
  QUIC frames is described in {{QUIC-TRANSPORT}}.  If false, it is still
  acceptable for an ack to be received for this packet.  However, a caller MUST
  NOT set is_retransmittable to true if an ack is not expected.

* sent_bytes: The number of bytes sent in the packet.

Pseudocode for OnPacketSent follows:

~~~
 OnPacketSent(packet_number, is_retransmittable, sent_bytes):
   # TODO: Clarify the data in sent_packets.
   sent_packets[packet_number].time = now
   if is_retransmittable:
     sent_packets[packet_number].bytes = sent_bytes
     SetLossDetectionAlarm()
~~~

## On Ack Receipt

When an ack is received, it may acknowledge 0 or more packets.

Pseudocode for OnAckReceived and UpdateRtt follow:

~~~
   OnAckReceived(ack):
     // If the largest acked is newly acked, update the RTT.
     if (sent_packets[ack.largest_acked]):
       rtt_sample = now - sent_packets[ack.largest_acked].time
       if (rtt_sample > ack.ack_delay):
         rtt_sample -= ack.delay
       UpdateRtt(rtt_sample)
     // Find all newly acked packets.
     for acked_packet in DetermineNewlyAckedPackets():
       OnPacketAcked(acked_packet)

     DetectLostPackets(ack.largest_acked_packet)
     SetLossDetectionAlarm()


   UpdateRtt(rtt_sample):
     // Based on {{?RFC6298}}.
     if (smoothed_rtt == 0):
       smoothed_rtt = rtt_sample
       rttvar = rtt_sample / 2
     else:
       rttvar = 3/4 * rttvar + 1/4 * (smoothed_rtt - rtt_sample)
       smoothed_rtt = 7/8 * smoothed_rtt + 1/8 * rtt_sample
~~~

## On Packet Acknowledgment

When a packet is acked for the first time, the following OnPacketAcked function
is called.  Note that a single ACK frame may newly acknowledge several packets.
OnPacketAcked must be called once for each of these newly acked packets.

OnPacketAcked takes one parameter, acked_packet, which is the packet number of
the newly acked packet, and returns a list of packet numbers that are detected
as lost.

Pseudocode for OnPacketAcked follows:

~~~
   OnPacketAcked(acked_packet):
     handshake_count = 0
     tlp_count = 0
     rto_count = 0
     # TODO: Don't remove packets immediately, since they can be
     # used for detecting spurous retransmits.
     sent_packets.remove(acked_packet)
~~~

## Setting the Loss Detection Alarm

QUIC loss detection uses a single alarm for all timer-based loss detection.  The
duration of the alarm is based on the alarm's mode, which is set in the packet
and timer events further below.  The function SetLossDetectionAlarm defined
below shows how the single timer is set based on the alarm mode.

### Handshake Packets

The initial flight has no prior RTT sample.  A client SHOULD remember
the previous RTT it observed when resumption is attempted and use that for an
initial RTT value.  If no previous RTT is available, the initial RTT defaults
to 200ms.  Once an RTT measurement is taken, it MUST replace initial_rtt.

Endpoints MUST retransmit handshake frames if not acknowledged within a
time limit. This time limit will start as the largest of twice the rtt value
and MinTLPTimeout.  Each consecutive handshake retransmission doubles the
time limit, until an acknowledgement is received.

Handshake frames may be cancelled by handshake state transitions.  In
particular, all non-protected frames SHOULD be no longer be transmitted once
packet protection is available.

When stateless rejects are in use, the connection is considered immediately
closed once a reject is sent, so no timer is set to retransmit the reject.

Version negotiation packets are always stateless, and MUST be sent once per
per handshake packet that uses an unsupported QUIC version, and MAY be sent
in response to 0RTT packets.

(Add sections for early retransmit and TLP/RTO here)

### Psuedocode

Pseudocode for SetLossDetectionAlarm follows:

~~~
 SetLossDetectionAlarm():
    if (retransmittable packets are not outstanding):
      loss_detection_alarm.cancel();
      return

    if (handshake packets are outstanding):
      // Handshake retransmission alarm.
      if (smoothed_rtt == 0):
        alarm_duration = 2 * initial_rtt
      else:
        alarm_duration = 2 * smoothed_rtt
      alarm_duration = max(alarm_duration, kMinTLPTimeout)
      alarm_duration = alarm_duration << handshake_count
      handshake_count++;
    else if (largest sent packet is acked):
      // Early retransmit {{!RFC 5827}}
      // with an alarm to reduce spurious retransmits.
      alarm_duration = 0.25 * smoothed_rtt
    else if (tlp_count < kMaxTLPs):
      // Tail Loss Probe alarm.
      if (retransmittable_packets_outstanding = 1):
        alarm_duration = 1.5 * smoothed_rtt + kDelayedAckTimeout
      else:
        alarm_duration = kMinTLPTimeout
      alarm_duration = max(alarm_duration, 2 * smoothed_rtt)
      tlp_count++
    else:
      // RTO alarm.
      if (rto_count = 0):
        alarm_duration = smoothed_rtt + 4 * rttvar
        alarm_duration = max(alarm_duration, kMinRTOTimeout)
      else:
        alarm_duration = loss_detection_alarm.get_delay() << 1
      rto_count++

    loss_detection_alarm.set(now + alarm_duration)
~~~

## On Alarm Firing

QUIC uses one loss recovery alarm, which when set, can be in one of several
modes.  When the alarm fires, the mode determines the action to be performed.
OnAlarm returns a list of packet numbers that are detected as lost.

Pseudocode for OnAlarm follows:

~~~
   OnAlarm(acked_packet):
     lost_packets = DetectLostPackets(acked_packet)
     MaybeRetransmit(lost_packets)
     SetLossDetectionAlarm()
~~~

## Detecting Lost Packets

Packets in QUIC are only considered lost once a larger packet number is
acknowledged.  DetectLostPackets is called every time there is a new largest
packet or if the loss detection alarm fires the previous largest acked packet is
supplied.

### Handshake Packets

The receiver MUST ignore unprotected packets that ack protected packets.
The receiver MUST trust protected acks for unprotected packets, however.  Aside
from this, loss detection for handshake packets when an ack is processed is
identical to other packets.

### Psuedocode

DetectLostPackets takes one parameter, acked, which is the largest acked packet,
and returns a list of packets detected as lost.

Pseudocode for DetectLostPackets follows:

~~~
   DetectLostPackets(acked):
     lost_packets = {}
     foreach (unacked less than acked):
       time_delta = acked.time_sent - unacked.time_sent
       packet_delta = acked.packet_number - unacked.packet_number
       if (time_delta > kTimeReorderThreshold * smoothed_rtt):
         lost_packets.insert(unacked)
       else if (packet_delta > reordering_threshold)
         lost_packets.insert(unacked)
     return lost_packets
~~~

# Congestion Control

(describe NewReno-style congestion control for QUIC.)
(describe appropriate byte counting.)
(define recovery based on packet numbers.)
(describe min_rtt based hystart.)
(describe how QUIC's F-RTO delays reducing CWND until an ack is received.)


# IANA Considerations

This document has no IANA actions.  Yet.


--- back

# Acknowledgments


# Change Log

> **RFC Editor's Note:**  Please remove this section prior to publication of a
> final version of this document.

## Since draft-ietf-quic-recovery-00:

- Improved description of constants and ACK behavior

## Since draft-iyengar-quic-loss-recovery-01:

- Adopted as base for draft-ietf-quic-recovery.

- Updated authors/editors list.

- Added table of contents.
