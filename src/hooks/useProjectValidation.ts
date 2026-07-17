import { useState, useCallback, useRef } from 'react';
import { createProjectValidator, validateProjectSize, validateElementsCount, sanitizeAssetUrl } from '../utils/projectSchema';
import { ProjectFile, ProjectValidationError, ProjectApplyResult } from '../types/project';

interface ProjectValidationHook {
  validateProject: (jsonString: string) => ProjectApplyResult;
  isValidating: boolean;
  lastValidationErrors: ProjectValidationError[];
}

export const useProjectValidation = (): ProjectValidationHook => {
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidationErrors, setLastValidationErrors] = useState<ProjectValidationError[]>([]);
  const validatorRef = useRef(createProjectValidator());

  const validateProject = useCallback((jsonString: string): ProjectApplyResult => {
    setIsValidating(true);
    
    try {
      // Step 1: Basic JSON parsing
      let parsed: any;
      try {
        parsed = JSON.parse(jsonString);
      } catch (error) {
        const parseError: ProjectValidationError = {
          path: 'root',
          message: `Invalid JSON syntax: ${error instanceof Error ? error.message : 'Unknown parse error'}`
        };
        setLastValidationErrors([parseError]);
        return { success: false, errors: [parseError] };
      }

      // Step 2: Size validation
      if (!validateProjectSize(jsonString)) {
        const sizeError: ProjectValidationError = {
          path: 'root',
          message: 'Project file exceeds 10MB size limit'
        };
        setLastValidationErrors([sizeError]);
        return { success: false, errors: [sizeError] };
      }

      // Step 3: Schema validation with AJV
      const validator = validatorRef.current;
      const isValid = validator(parsed);
      
      if (!isValid && validator.errors) {
        const validationErrors: ProjectValidationError[] = validator.errors.map(error => ({
          path: error.instancePath || error.schemaPath || 'unknown',
          message: `${error.instancePath || 'root'}: ${error.message || 'Validation error'}`,
          value: error.data
        }));
        
        setLastValidationErrors(validationErrors);
        return { success: false, errors: validationErrors };
      }

      const project = parsed as ProjectFile;

      // Step 4: Business logic validation
      const businessErrors: ProjectValidationError[] = [];
      const warnings: string[] = [];

      // Validate elements count
      if (!validateElementsCount(project)) {
        businessErrors.push({
          path: 'elements',
          message: 'Project contains too many elements (max 20,000)'
        });
      }

      // Validate element order consistency
      const elementIds = Object.keys(project.elements.byId);
      const orderIds = project.elements.order;
      
      const missingFromOrder = elementIds.filter(id => !orderIds.includes(id));
      const missingFromById = orderIds.filter(id => !project.elements.byId[id]);
      
      if (missingFromOrder.length > 0) {
        businessErrors.push({
          path: 'elements.order',
          message: `Elements missing from order array: ${missingFromOrder.join(', ')}`
        });
      }
      
      if (missingFromById.length > 0) {
        businessErrors.push({
          path: 'elements.byId',
          message: `Elements in order array but missing from byId: ${missingFromById.join(', ')}`
        });
      }

      // Sanitize and validate asset URLs
      if (project.assets?.images) {
        Object.values(project.assets.images).forEach(image => {
          const sanitized = sanitizeAssetUrl(image.src);
          if (sanitized !== image.src) {
            warnings.push(`Sanitized image URL for ${image.name || image.id}`);
            image.src = sanitized;
          }
        });
      }

      // Validate animations reference existing elements
      if (project.animations) {
        Object.values(project.animations.byId).forEach(animation => {
          if (!project.elements.byId[animation.elementId]) {
            businessErrors.push({
              path: `animations.byId.${animation.id}`,
              message: `Animation references non-existent element: ${animation.elementId}`
            });
          }
        });
      }

      if (businessErrors.length > 0) {
        setLastValidationErrors(businessErrors);
        return { 
          success: false, 
          errors: businessErrors,
          warnings: warnings.length > 0 ? warnings : undefined
        };
      }

      // Success
      setLastValidationErrors([]);
      
      return {
        success: true,
        warnings: warnings.length > 0 ? warnings : undefined,
        changesSummary: `Project validated successfully - ${elementIds.length} elements, ${Object.keys(project.animations?.byId || {}).length} animations`
      };

    } catch (error) {
      const unexpectedError: ProjectValidationError = {
        path: 'root',
        message: `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      setLastValidationErrors([unexpectedError]);
      return { success: false, errors: [unexpectedError] };
    } finally {
      setIsValidating(false);
    }
  }, []);

  return {
    validateProject,
    isValidating,
    lastValidationErrors
  };
};