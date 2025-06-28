# Entities

- USER
- POST
- SUBSCRIPTION
- PROMPT TEMPLATES

- AGENTS

MEDIA

- TEXT(PDF/CSV/MD)
- AUDIO
- VIDEO

## Access Patterns

### USERS

- Create User
- Get User
- Get User By Email
- Update User

### POSTS

- Create Post
- Delete Post
- Get User Posts

### PROMPT TEMPLATES

- Create Template
- Update Template
- Get Template
- Get All Templates

### SUBSCRIPTIONS

- Create Subscription
- Create User Subscription
- Get All Subscription
- Get Subscription
- Get User Subscription

### GALLERY

- Get User Gallery

# Creating a Post

A post is made up of different formats

- Text can either be typed or AI Generated
- Images can either be selected from users device or AI generated with Nova
  Canvas
- Video can either be selected from users device or generated with Nova Reels

These 3 formats can be mixed and matched to create a post.

When a post is created and sent to the backend, here's what happens.

The architecture below represents the AWS Services involved its entire flow.

![create-post](/assets/create_post_solutions_architecture.png) When a post is
created, it is saved to a Dynamodb Table. The table is configured to trigger a
Dynamodb stream on NEW_IMAGE created. This stream of events is picked up by an
eventbridge pipe. The pipe filters for new events with Entity=POST. We do this
filtering because, our table follows the single table design pattern. Meaning
new items can be created with different Entities. We don't want the pipe to
forward events whose Entities aren't POST.

The pipe has an eventbridge rule as it's target. The event is forwarded to this
rule. Subscribed to this rule is a lambda function(Scheduled Post).This lambda
function gets the event, extract the Post and schedules the post for a
particular day and date as requested by the post creator using the Eventbridge
Scheduler. Another lambda function gets triggered by the Eventbridge Scheduler.
This function is responsible for uploading the post to the selected social media
platform
