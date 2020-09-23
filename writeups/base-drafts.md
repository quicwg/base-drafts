# Shepherd Writeup for QUIC "base drafts"

## 1. Summary
<!--
(1) What type of RFC is being requested (BCP, Proposed Standard, Internet
Standard, Informational, Experimental, or Historic)? Why is this the proper type
of RFC? Is this type of RFC indicated in the title page header?
-->

This publication requests covers the following I-Ds that together define the
QUIC protocol:

* **QUIC: A UDP-Based Multiplexed and Secure Transport**,
  draft-ietf-quic-transport-31
* **QUIC Loss Detection and Congestion Control**, draft-ietf-quic-recovery-31
* **Using TLS to Secure QUIC**, draft-ietf-quic-tls-31
* **Version-Independent Properties of QUIC**, draft-ietf-quic-invariants-11
* **Hypertext Transfer Protocol Version 3 (HTTP/3)**, draft-ietf-quic-http-31
* **QPACK: Header Compression for HTTP/3**, draft-ietf-quic-qpack-18

All of these I-Ds are intended to become Proposed Standard RFCs, and that
intended status is indicated in their respective title page headers.


## 2. Document Announcement Write-Up
<!--
(2) The IESG approval announcement includes a Document Announcement Write-Up.
Please provide such a Document Announcement Write-Up. Recent examples can be
found in the "Action" announcements for approved documents. The approval
announcement contains the following sections:
-->


### Technical Summary:
<!--
Relevant content can frequently be found in the abstract and/or introduction of
the document. If not, this may be an indication that there are deficiencies in
the abstract or introduction.
-->

QUIC is a standards-track, UDP-based, stream-multiplexing, encrypted transport
protocol. Its main features are minimizing connection establishment and overall
transport latency for applications such as HTTP/3, providing multiplexing
without head-of-line blocking, requiring only changes to path endpoints to
enable deployment, providing always-secure transport using TLS 1.3. This
document set specifies the QUIC transport protocol and it version-independent
invariants, its loss detection and recovery approach, its use of TLS1.3 for
providing security, as well as an HTTP binding on top of QUIC (called HTTP/3)
that uses QPACK for header compression.


### Working Group Summary:
<!--
Was there anything in WG process that is worth noting? For example, was there
controversy about particular points or were there decisions where the consensus
was particularly rough?
-->

As can be expected, discussion on many aspects of QUIC was quite intense. The
resulting consensus, however, was very strong.


### Document Quality:
<!--
Are there existing implementations of the protocol? Have a significant number of
vendors indicated their plan to implement the specification? Are there any
reviewers that merit special mention as having done a thorough review, e.g., one
that resulted in important changes or a conclusion that the document had no
substantive issues? If there was a MIB Doctor, YANG Doctor, Media Type or other
expert review, what was its course (briefly)? In the case of a Media Type
review, on what date was the request posted?
-->

There are over twenty implementations of QUIC that are participating in interop
testing, including all major web browsers and many server, CDN and standalone
library implementations.

The acknowledgements sections of the I-Ds highlight the individuals that made
major contributions to a given document.


### Personnel:
<!-- Who is the Document Shepherd? Who is the Responsible Area Director? -->

The document shepherds for the individual I-Ds are:

* **Lucas Pardue**:
  * draft-ietf-quic-http-31
  * draft-ietf-quic-qpack-18
* **Lars Eggert**:
  * draft-ietf-quic-transport-31
  * draft-ietf-quic-recovery-31
* **Mark Nottingham**:
  * draft-ietf-quic-tls-31
  * draft-ietf-quic-invariants-11

The responsible AD for the document set is Magnus Westerlund.


## 3. Document Shepherd Review
<!--
(3) Briefly describe the review of this document that was performed by the
Document Shepherd. If this version of the document is not ready for publication,
please explain why the document is being forwarded to the IESG.
-->

The document shepherds extensively reviewed the documents before this
publication request.


## 4. Document Shepherd Review Concerns
<!--
(4) Does the document Shepherd have any concerns about the depth or breadth of
the reviews that have been performed?
-->

The document shepherds have no concerns about the depth or breadth of the
reviews for these documents.


## 5. Broader Reviews
<!--
(5) Do portions of the document need review from a particular or from broader
perspective, e.g., security, operational complexity, AAA, DNS, DHCP, XML, or
internationalization? If so, describe the review that took place.
-->

Parts of the document set benefited from specialized reviews from the TLS, HTTP
and transport IETF communities.


## 6. Document Shepherd General Concerns
<!--
(6) Describe any specific concerns or issues that the Document Shepherd has with
this document that the Responsible Area Director and/or the IESG should be aware
of? For example, perhaps he or she is uncomfortable with certain parts of the
document, or has concerns whether there really is a need for it. In any event,
if the WG has discussed those issues and has indicated that it still wishes to
advance the document, detail those concerns here.
-->

The document shepherds have no general concerns about these documents.


# 7. IPR Disclosure Obligation
<!--
(7) Has each author confirmed that any and all appropriate IPR disclosures
required for full conformance with the provisions of BCP 78 and BCP 79 have
already been filed. If not, explain why?
-->

The editors of the I-Ds have all declared that they have filed any and all
appropriate IPR disclosures required for full conformance with the provisions of
BCP 78 and BCP 79.


## 8. Filed IPR Disclosures
<!--
(8) Has an IPR disclosure been filed that references this document? If so,
summarize any WG discussion and conclusion regarding the IPR disclosures.
-->

draft-ietf-quic-recovery has had an IPR disclosure filed on it. No resulting
technical changes were argued for.


## 9. Strength of Consensus
<!--
(9) How solid is the WG consensus behind this document? Does it represent the
strong concurrence of a few individuals, with others being silent, or does the
WG as a whole understand and agree with it?
-->

The consensus behind the document set is very strong, also as evidenced by the
substantial number of existing implementations.

The WG last calls were forwarded to the TLS and HTTP WGs, due to the topical
relationships.


## 10. Discontent
<!--
(10) Has anyone threatened an appeal or otherwise indicated extreme discontent?
If so, please summarise the areas of conflict in separate email messages to the
Responsible Area Director. (It should be in a separate email because this
questionnaire is publicly available.)
-->

No discontent was voiced.


## 11. Document Nits
<!--
(11) Identify any ID nits the Document Shepherd has found in this document. (See
http://www.ietf.org/tools/idnits/ and the Internet-Drafts Checklist).
Boilerplate checks are not enough; this check needs to be thorough.
-->

The document shepherds have identified no nits.


## 12. Formal Review Criteria
<!--
(12) Describe how the document meets any required formal review criteria, such
as the MIB Doctor, YANG Doctor, media type, and URI type reviews.
-->

No formal review requirements are applicable to this document set.


## 13. Split References
<!--
(13) Have all references within this document been identified as either
normative or informative?
-->

All references within this document set have been identified as either normative
or informative.


## 14. Normative References
<!--
(14) Are there normative references to documents that are not ready for
advancement or are otherwise in an unclear state? If such normative references
exist, what is the plan for their completion?
-->

The document set contains the following normative references to I-Ds:

* draft-ietf-httpbis-cache
* draft-ietf-httpbis-semantics

All of these are on track for timely publication in their respective WGs.


## 15. Downward References
<!--
(15) Are there downward normative references references (see RFC 3967)? If so,
list these downward references to support the Area Director in the Last Call
procedure.
-->

There are no normative downward references in the document set.


## 16. RFC Status Changes
<!--
(16) Will publication of this document change the status of any existing RFCs?
Are those RFCs listed on the title page header, listed in the abstract, and
discussed in the introduction? If the RFCs are not listed in the Abstract and
Introduction, explain why, and point to the part of the document where the
relationship of this document to the other RFCs is discussed. If this
information is not in the document, explain why the WG considers it unnecessary.
-->

Publication of this document set will not change the status of any existing
RFCs.


## 17. IANA Considerations Review
<!--
(17) Describe the Document Shepherd's review of the IANA considerations section,
especially with regard to its consistency with the body of the document. Confirm
that all protocol extensions that the document makes are associated with the
appropriate reservations in IANA registries. Confirm that any referenced IANA
registries have been clearly identified. Confirm that newly created IANA
registries include a detailed specification of the initial contents for the
registry, that allocations procedures for future registrations are defined, and
a reasonable name for the new registry has been suggested (see RFC 8126).
-->

The IANA considerations of the document set have been reviewed and no issues
were identified.


## 18. New "Expert Review" Registries
<!--
(18) List any new IANA registries that require Expert Review for future
allocations. Provide any public guidance that the IESG would find useful in
selecting the IANA Experts for these new registries.
-->

The document set defines several IANA registries that offer “Provisional
Registrations” and "Permanent Registration, which both require Expert review.
The IESG should select subject matter experts for these registration types;
candidates include the document editors and the individuals named as
contributors in the acknowledgment sections.


## 19. Validation of Formal Language Parts
<!--
(19) Describe reviews and automated checks performed by the Document Shepherd to
validate sections of the document written in a formal language, such as XML
code, BNF rules, MIB definitions, YANG modules, etc.
-->

No formal code exists in the document set. draft-ietf-quic-transport,
draft-ietf-quic-recovery and draft-ietf-quic-qpack contain python-like pseudo
code, but not at a level of detail that would lend itself to automated checking.


## 20. YANG
<!--
(20) If the document contains a YANG module, has the module been checked with
any of the recommended validation tools
(https://trac.ietf.org/trac/ops/wiki/yang-review-tools) for syntax and
formatting validation? If there are any resulting errors or warnings, what is
the justification for not fixing them at this time? Does the YANG module comply
with the Network Management Datastore Architecture (NMDA) as specified in
RFC8342?
-->

The document set does not contain a YANG model.
