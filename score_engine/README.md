# Score Engine

This is the credit score engine project, developed with FastAPI.

## Week 1 - Planning

- **Objective**: Create basic skeletons for GET and POST APIs for the score engine.
- **Implemented APIs**:
  - GET `/`: Root route that returns a welcome message.
  - POST `/score/`: Route to calculate score (currently returns a mock score).

## How to run

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the server (option 1 - using uvicorn directly):
   ```
   uvicorn src.main:app --reload
   ```

3. Or run the server (option 2 - using Python script):
   ```
   python src/main.py
   ```

4. Access the automatic documentation at: http://127.0.0.1:8000/docs

## Next steps (Future weeks)

- Implement real score calculation logic.
- Add data validation.
- Integrate with database.
- Add authentication.
- Unit and integration tests.