/* RailSync AI - Component Controller Helpers */

window.RailSyncUI = (function () {
  'use strict';

  // Toggle Slide-over Drawer
  function toggleDrawer(drawerId, open) {
    const backdrop = document.getElementById(drawerId);
    if (!backdrop) return;
    if (open === undefined) {
      backdrop.classList.toggle('open');
    } else if (open) {
      backdrop.classList.add('open');
    } else {
      backdrop.classList.remove('open');
    }
  }

  // Toggle Modal Dialog
  function toggleModal(modalId, open) {
    const backdrop = document.getElementById(modalId);
    if (!backdrop) return;
    if (open === undefined) {
      backdrop.classList.toggle('open');
    } else if (open) {
      backdrop.classList.add('open');
    } else {
      backdrop.classList.remove('open');
    }
  }

  // Initialize event listeners for drawer and modal close triggers
  function initComponentListeners() {
    document.addEventListener('click', function (e) {
      // Close drawer backdrop click
      if (e.target.classList.contains('drawer-backdrop')) {
        e.target.classList.remove('open');
      }
      // Close modal backdrop click
      if (e.target.classList.contains('modal-backdrop')) {
        e.target.classList.remove('open');
      }
      // Trigger drawer close button
      if (e.target.closest('[data-dismiss="drawer"]')) {
        const backdrop = e.target.closest('.drawer-backdrop');
        if (backdrop) backdrop.classList.remove('open');
      }
      // Trigger modal close button
      if (e.target.closest('[data-dismiss="modal"]')) {
        const backdrop = e.target.closest('.modal-backdrop');
        if (backdrop) backdrop.classList.remove('open');
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.drawer-backdrop.open, .modal-backdrop.open').forEach(el => {
          el.classList.remove('open');
        });
      }
    });
  }

  // Run auto init
  document.addEventListener('DOMContentLoaded', initComponentListeners);

  return {
    toggleDrawer: toggleDrawer,
    toggleModal: toggleModal
  };
})();
