export const useNavigate = () => {
  return (path: string) => {
    window.location.hash = path;
  };
};

export const useCurrentPath = (): string => {
  return window.location.hash.slice(1) || '/';
};
