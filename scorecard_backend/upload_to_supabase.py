from textwrap import dedent


def main():
    message = dedent(
        """
        This script is deprecated for this fork.

        The project now uses an upload-managed Supabase design:
        - run scorecard_backend/supabase_cleanup.sql if you want to remove the old fixed tables
        - run scorecard_backend/supabase_schema.sql to create the minimal upload schema
        - upload tx_state_data and nj_state_data through the Upload & Update page

        No direct seed script is needed for the new workflow.
        """
    ).strip()
    print(message)


if __name__ == "__main__":
    main()
