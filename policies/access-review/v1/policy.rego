package complyos.access_review.v1

import rego.v1

revision := "1.0.0"

permission := {null, "none", "read"}

outcome(row) := value if {
	row.expected in permission
	row.observed in permission
	is_boolean(row.exception_active)
	value := classify(row)
}

classify(row) := "INSUFFICIENT_EVIDENCE" if {
	row.expected == null
}

else := "INSUFFICIENT_EVIDENCE" if {
	row.observed == null
}

else := "AS_EXPECTED" if {
	row.expected == row.observed
}

else := "MISSING_EXPECTED_GRANT" if {
	row.observed == "none"
}

else := "APPROVED_EXCEPTION" if {
	row.exception_active
}

else := "EXCESS_ACCESS"

decision := {"revision": revision, "outcomes": outcomes} if {
	input.revision == revision
	is_array(input.rows)
	outcomes := [outcome(row) | some row in input.rows]
	count(outcomes) == count(input.rows)
}
