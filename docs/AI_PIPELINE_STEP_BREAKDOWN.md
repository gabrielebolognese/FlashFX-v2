# AI Pipeline Step-by-Step Breakdown

## Overview
The AI generation pipeline now shows a clear visual progression in the chat interface, making it easy for users to understand what's happening at each stage.

## Pipeline Flow

### Step 1: Initial Confirmation
**When:** User submits a prompt
**What happens:**
- AI sends message: *"I'll create a beautiful design with your specified requirements. Preparing to start..."*
- Message appears as a completed step (no loader)
- Brief 800ms pause for user to read

**UI Display:**
```
✓ I'll create a beautiful design with your specified requirements. Preparing to start...
```

---

### Step 2: Prompt Validation
**When:** After initial confirmation
**What happens:**
- AI sends message: *"Checking prompt..."* with a loader icon
- Calls validation assistant (`asst_0crxCl5jFThLe0uN6xKwgJAa`)
- Waits for validation response (0 or 1)

**UI Display (Processing):**
```
⟳ Checking prompt...
```

**Success Case:**
```
✓ Prompt Approved ✓
```

**Failure Case:**
```
✗ Prompt Rejected ✗
```
- If rejected, pipeline stops here
- Shows explanation message about why it was rejected

---

### Step 3: High-Level Breakdown
**When:** After prompt is approved
**What happens:**
- AI sends message: *"Breaking down request..."* with a loader icon
- Calls high-level assistant (`asst_uLIk3I1aeLrCJI23m3F84lWl`)
- Receives JSON array of shape specifications
- Validates the JSON structure

**UI Display (Processing):**
```
⟳ Breaking down request...
```

**Success Case:**
```
✓ Action Completed ✓
```

**Failure Case:**
```
✗ Breakdown Failed ✗ - [error message]
```

---

### Step 4: Explanation Message
**When:** After successful high-level breakdown
**What happens:**
- AI sends informational message explaining the next phase
- No loader, just text
- Brief 400ms pause

**UI Display:**
```
I've broken down the animation into an actionable plan. Now I need to create
the shapes one by one. This process might take a while because the AI is
experimental. You can still edit while I generate and check the status on
the plan below:
```

---

### Step 5: Generation Plan Display
**When:** Immediately after explanation message
**What happens:**
- Creates a special "plan" message with a list of all shapes to generate
- Each shape shows as a row with a status indicator
- Number of rows = number of shapes in high-level breakdown

**UI Display:**
```
Generation Plan:
┌─────────────────────────────┐
│ -  rectangle 1              │
│ -  text 2                   │
│ -  line 3                   │
│ -  rectangle 4              │
│ -  text 5                   │
│ -  circle 6                 │
│ -  button 7                 │
└─────────────────────────────┘
```

**Status Indicators:**
- `-` = Pending (gray)
- `⟳` = Processing (animated spinner, violet)
- `✓` = Completed (green checkmark)
- `✗` = Failed (red X)

---

### Step 6: Low-Level Generation
**When:** Plan is displayed
**What happens:**
- Loops through each shape in the high-level breakdown
- For each shape:
  1. Updates plan row to show "processing" (spinner)
  2. Calls low-level assistant (`asst_z8sn6AEmZxXPDPp9DD8A4LC2`) with shape + original prompt
  3. Receives detailed shape specification JSON
  4. Validates and repairs if needed
  5. Updates plan row to show "completed" (checkmark) or "failed" (X)
  6. 300ms delay before next shape

**UI Display (During Processing):**
```
Generation Plan:
┌─────────────────────────────┐
│ ✓  rectangle 1              │
│ ✓  text 2                   │
│ ⟳  line 3                   │  ← Currently processing
│ -  rectangle 4              │
│ -  text 5                   │
│ -  circle 6                 │
│ -  button 7                 │
└─────────────────────────────┘
```

**UI Display (Completed):**
```
Generation Plan:
┌─────────────────────────────┐
│ ✓  rectangle 1              │
│ ✓  text 2                   │
│ ✓  line 3                   │
│ ✓  rectangle 4              │
│ ✓  text 5                   │
│ ✓  circle 6                 │
│ ✓  button 7                 │
└─────────────────────────────┘
```

**UI Display (With Failures):**
```
Generation Plan:
┌─────────────────────────────┐
│ ✓  rectangle 1              │
│ ✓  text 2                   │
│ ✗  line 3         Generation failed │
│ ✓  rectangle 4              │
│ ✓  text 5                   │
│ ✓  circle 6                 │
│ ✓  button 7                 │
└─────────────────────────────┘
```

---

### Step 7: Element Placement
**When:** All shapes are generated (or attempted)
**What happens:**
- Maps each JSON specification to DesignElement
- Clamps positions to canvas bounds
- Batch adds all elements to canvas
- Updates pipeline to "complete"

**No additional chat message** - placement happens silently

---

### Step 8: Final Success Message
**When:** All elements placed on canvas
**What happens:**
- AI sends final summary message

**UI Display:**
```
✅ Successfully created 7 elements in 24.3s!
```

**With warnings (if any failed):**
```
✅ Successfully created 6 elements in 24.3s!
⚠️ 1 element(s) could not be generated.
```

---

## Key Features

### Real-Time Updates
- The plan message updates in real-time as each shape is processed
- Users can see exactly which shape is currently being generated
- Progress is visible even if they switch to other tabs

### Non-Blocking
- Users can continue editing their project while generation happens
- Chat remains scrollable and interactive
- Cancel button available throughout process

### Clear Status Communication
Each message type has distinct visual styling:
- **Step Messages**: Icon + text (✓, ✗, or ⟳)
- **Info Messages**: Plain text, no icon
- **Plan Message**: Special bordered box with rows

### Error Handling
- If validation fails: Shows clear rejection message
- If breakdown fails: Shows what went wrong
- If individual shape fails: Marked with ✗ in plan, others continue
- If all shapes fail: Shows comprehensive error message

---

## Technical Implementation

### Message Types
```typescript
interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  isStepMessage?: boolean;  // For validation/breakdown steps
  shapeItems?: ShapeGenerationItem[];  // For plan display
}
```

### Shape Item Structure
```typescript
interface ShapeGenerationItem {
  index: number;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}
```

### Message Flow Control
1. `addStepMessage()` - Creates new step message
2. `updateStepMessage()` - Updates existing message status
3. Real-time updates through React state management
4. Plan message updates by mapping over shapeItems array

---

## User Experience Benefits

1. **Transparency**: Users see exactly what's happening at each step
2. **Progress Tracking**: Clear visual indication of completion percentage
3. **Error Clarity**: Failed steps show specific error messages
4. **Cancellable**: Users can stop generation at any time
5. **Non-Disruptive**: Can continue working while AI generates
6. **Historical Record**: All generation attempts saved in chat history

---

## Example Complete Flow

```
User: "create a login form with username, password, and submit button"

AI: ✓ I'll create a beautiful design with your specified requirements.
      Preparing to start...

AI: ⟳ Checking prompt...
    [2 seconds later]
    ✓ Prompt Approved ✓

AI: ⟳ Breaking down request...
    [5 seconds later]
    ✓ Action Completed ✓

AI: I've broken down the animation into an actionable plan. Now I need to
    create the shapes one by one. This process might take a while because
    the AI is experimental. You can still edit while I generate and check
    the status on the plan below:

AI: Generation Plan:
    ┌─────────────────────────────┐
    │ ⟳  rectangle 1              │  ← Form container
    │ -  text 2                   │  ← Username label
    │ -  input 3                  │  ← Username field
    │ -  text 4                   │  ← Password label
    │ -  input 5                  │  ← Password field
    │ -  button 6                 │  ← Submit button
    └─────────────────────────────┘

    [Updates in real-time as each processes]

AI: ✅ Successfully created 6 elements in 18.4s!
```

---

## Performance Considerations

- 300ms delay between shape generations (respects API rate limits)
- Messages batch update in React state (no excessive re-renders)
- Plan message updates efficiently through targeted state changes
- LocalStorage saves full pipeline for recovery if needed

---

## Future Enhancements

Possible improvements:
- Add time estimates for each shape
- Show preview thumbnails in plan
- Allow clicking plan rows to highlight on canvas
- Add "retry failed" button for individual shapes
- Export generation report as PDF/JSON
