use std::sync::Arc;

use crossbeam_queue::ArrayQueue;

/// Fixed-capacity, non-blocking queue allocated completely at construction.
#[derive(Debug)]
pub struct BoundedRing<T> {
    queue: Arc<ArrayQueue<T>>,
}

impl<T> Clone for BoundedRing<T> {
    fn clone(&self) -> Self {
        Self {
            queue: Arc::clone(&self.queue),
        }
    }
}

impl<T> BoundedRing<T> {
    pub fn new(capacity: usize) -> Self {
        Self {
            queue: Arc::new(ArrayQueue::new(capacity)),
        }
    }

    pub fn push(&self, value: T) -> Result<(), T> {
        self.queue.push(value)
    }

    pub fn push_overwrite_oldest(&self, value: T) -> Option<T> {
        self.queue.force_push(value)
    }

    pub fn pop(&self) -> Option<T> {
        self.queue.pop()
    }

    pub fn len(&self) -> usize {
        self.queue.len()
    }

    pub fn capacity(&self) -> usize {
        self.queue.capacity()
    }

    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overwrite_discards_the_oldest_complete_value() {
        let ring = BoundedRing::new(2);
        assert_eq!(ring.push_overwrite_oldest(1), None);
        assert_eq!(ring.push_overwrite_oldest(2), None);
        assert_eq!(ring.push_overwrite_oldest(3), Some(1));
        assert_eq!(ring.pop(), Some(2));
        assert_eq!(ring.pop(), Some(3));
    }
}
