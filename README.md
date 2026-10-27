# Chat UI update

Copy the three files from frontend/src into your project's frontend/src folder, replacing the two existing TSX files. The CSS file is new and is imported by PreparationChat.tsx. Run `npm run build` from the frontend folder and restart the development server if necessary.

The chat component is shared by Prepare and Conduct meeting, so both screens get the updated appearance. The current responses remain keyword-based samples, and the interface indicates that the AI connection is pending. No backend changes are included. Existing chat and question-add behavior is preserved.

For new manual questions to start unselected, in MeetingPreparation.tsx change `selected: true` to `selected: false` in the `addQuestion` function, as described previously. This package does not replace that file.
