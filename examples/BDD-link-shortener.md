# Business Design Document: TinyLink

## Purpose
Let signed-in users turn long URLs into short links and see how many times each is clicked.

## Users
- Members: create links, view their own links and click counts.

## Core behaviors
- A member submits a long URL and gets back a short code.
- Visiting /{code} redirects to the original URL.
- A member sees a list of their links with total clicks each.

## Notes
- Should feel fast.
- We may add custom codes and expiry later.
