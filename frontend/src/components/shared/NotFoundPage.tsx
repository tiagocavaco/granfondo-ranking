import { Link } from "react-router-dom";
import { NotFoundState, ghostButtonClass } from "./NotFoundState";

export default function NotFoundPage() {
  return (
    <NotFoundState
      label="Page not found"
      description="This page doesn't exist. Check the URL or go back to the homepage."
      action={
        <Link to="/" className={ghostButtonClass}>
          ← Events
        </Link>
      }
    />
  );
}
